import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PAYMENT_PROVIDER, PAYOS_SETUP_LEASE_MS } from './payment-provider';
import type {
  PaymentProvider,
  PaymentProviderLink,
  VerifiedPaymentWebhook,
} from './payment-provider';
import { InvoicesService } from '../invoices/invoices.service';

const MAX_SAFE_VND = BigInt(Number.MAX_SAFE_INTEGER);
const REFERENCE_CONFLICT_REASON =
  'Provider reference is already assigned to another payment attempt.';

type PaymentState = { order: SalesOrder; attempt: PaymentAttempt };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
    private readonly dataSource: DataSource,
    private readonly invoices: InvoicesService,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  /** Verifies a public PayOS callback and reconciles it against provider state. */
  async handleWebhook(payload: unknown): Promise<{ success: true }> {
    let event: VerifiedPaymentWebhook;
    try {
      event = await this.provider.verifyWebhook(payload);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadRequestException(
        'Invalid PayOS webhook signature or payload.',
      );
    }

    if (
      !event.success ||
      event.code !== '00' ||
      event.data.code !== '00' ||
      event.data.currency !== 'VND' ||
      !Number.isSafeInteger(event.data.orderCode) ||
      event.data.orderCode <= 0 ||
      !Number.isSafeInteger(event.data.amount) ||
      event.data.amount <= 0 ||
      typeof event.data.reference !== 'string' ||
      event.data.reference.length === 0 ||
      event.data.reference.length > 255 ||
      typeof event.data.paymentLinkId !== 'string' ||
      event.data.paymentLinkId.length === 0 ||
      event.data.paymentLinkId.length > 255
    ) {
      this.logWebhookOutcome(event, 'non_success_or_invalid_candidate');
      return this.acknowledgeWebhook();
    }

    const state = await this.loadStateByProviderOrderCode(event.data.orderCode);
    if (!state) {
      this.logWebhookOutcome(event, 'provider_order_code_unknown');
      return this.acknowledgeWebhook();
    }

    let expectedAmount: number;
    try {
      expectedAmount = this.toWholeVnd(state.attempt.amount);
    } catch {
      this.logWebhookOutcome(event, 'local_attempt_amount_invalid');
      return this.acknowledgeWebhook();
    }

    if (
      state.order.paymentMethod !== 'payos' ||
      state.attempt.provider !== 'payos' ||
      state.attempt.providerOrderCode !== event.data.orderCode ||
      (state.attempt.providerPaymentLinkId !== null &&
        state.attempt.providerPaymentLinkId !== event.data.paymentLinkId) ||
      event.data.amount !== expectedAmount
    ) {
      this.logWebhookOutcome(event, 'local_order_attempt_mismatch');
      return this.acknowledgeWebhook();
    }

    if (
      state.order.paymentStatus === 'paid' &&
      state.attempt.status === 'paid' &&
      state.attempt.providerReference === event.data.reference
    ) {
      return this.acknowledgeWebhook();
    }

    let link: PaymentProviderLink | null;
    try {
      link = await this.provider.getLink(event.data.orderCode);
    } catch {
      // Return a retryable error. No payment state changes until PayOS can be queried.
      throw this.unavailable();
    }

    if (!link) {
      if (state.attempt.providerPaymentLinkId === null) {
        this.logWebhookOutcome(
          event,
          'provider_link_not_confirmed_for_orphan_attempt',
        );
        return this.acknowledgeWebhook();
      }
      await this.flagWebhookForReview(
        state,
        event,
        null,
        'PayOS confirmed webhook could not be reconciled because the payment link was not found.',
      );
      this.logWebhookOutcome(event, 'provider_payment_link_not_found');
      return this.acknowledgeWebhook();
    }

    if (
      state.attempt.providerPaymentLinkId === null &&
      (link.orderCode !== event.data.orderCode ||
        link.linkId !== event.data.paymentLinkId)
    ) {
      this.logWebhookOutcome(
        event,
        'provider_link_not_confirmed_for_orphan_attempt',
      );
      return this.acknowledgeWebhook();
    }

    const aggregateIsValid =
      Number.isSafeInteger(link.amountPaid) &&
      link.amountPaid >= 0 &&
      Number.isSafeInteger(link.amountRemaining) &&
      link.amountRemaining >= 0;
    const providerIdentityMatches =
      link.orderCode === state.attempt.providerOrderCode &&
      link.linkId === event.data.paymentLinkId &&
      link.amount === expectedAmount;
    const eventReferenceMatchesProvider =
      link.transactionReferences.length === 0 ||
      link.transactionReferences.includes(event.data.reference);

    if (
      providerIdentityMatches &&
      aggregateIsValid &&
      eventReferenceMatchesProvider &&
      link.status === 'PAID' &&
      link.amountPaid === expectedAmount &&
      link.amountRemaining === 0
    ) {
      const outcome = await this.applyFullPayment(
        state.order.orderId,
        link,
        event.data.reference,
      );
      if (outcome === 'attention') {
        this.logWebhookOutcome(event, 'full_payment_requires_reconciliation');
      }
      return this.acknowledgeWebhook();
    }

    const reason =
      providerIdentityMatches && eventReferenceMatchesProvider
        ? 'PayOS reported a successful webhook but its aggregate payment is incomplete or inconsistent.'
        : 'PayOS webhook and payment-link details do not match the local payment attempt.';
    await this.flagWebhookForReview(state, event, link, reason);
    this.logWebhookOutcome(
      event,
      providerIdentityMatches && eventReferenceMatchesProvider
        ? 'provider_aggregate_inconsistent'
        : 'provider_payment_link_mismatch',
    );
    return this.acknowledgeWebhook();
  }

  /** Starts a new link, or safely resumes the single attempt for an existing order. */
  async startOrResume(orderId: number, isNewOrder: boolean): Promise<void> {
    const state = await this.loadState(orderId);
    if (!state || state.order.paymentMethod !== 'payos') return;
    if (
      state.order.paymentStatus === 'paid' ||
      state.order.status !== 'pending'
    ) {
      return;
    }
    if (state.order.paymentStatus !== 'unpaid') return;

    if (!this.isConfigured()) {
      throw this.unavailable();
    }

    if (state.attempt.status === 'creating') {
      if (isNewOrder) {
        await this.createLink(orderId);
        return;
      }

      if (state.attempt.setupLeaseExpiresAt.getTime() > Date.now()) {
        throw this.unavailable();
      }

      const found = await this.lookupLink(state.attempt.providerOrderCode);
      if (found) {
        const outcome = await this.reconcileFoundLink(orderId, found);
        if (outcome === 'paid') return;
        throw this.unavailable();
      }

      const claim = await this.claimRetryLease(orderId);
      if (claim === 'expired') return;
      if (claim !== 'claimed') throw this.unavailable();
      await this.createLink(orderId);
      return;
    }

    if (
      state.attempt.status === 'pending' ||
      state.attempt.status === 'reconciliation_required'
    ) {
      const found = await this.lookupLink(state.attempt.providerOrderCode);
      if (!found) {
        await this.markReconciliationRequired(
          orderId,
          'PayOS payment link could not be found during customer retry.',
        );
        throw this.unavailable();
      }

      const outcome = await this.reconcileFoundLink(orderId, found);
      if (outcome === 'paid' || outcome === 'available') return;
      throw this.unavailable();
    }
  }

  /** Cancels a customer's PayOS order only after PayOS confirms zero paid and a terminal link. */
  async cancelPayosOrder(customerId: number, orderId: number): Promise<void> {
    const state = await this.loadOwnedState(customerId, orderId);
    if (!state) throw new NotFoundException('Order not found.');
    this.assertCustomerCanCancelPayos(state);
    if (!this.isConfigured()) throw this.unavailable();

    try {
      await this.provider.cancelLink(
        state.attempt.providerOrderCode,
        'Customer cancelled the order',
      );
    } catch {
      // A timeout may follow a successful cancel. The subsequent lookup is authoritative.
    }

    const link = await this.lookupLink(state.attempt.providerOrderCode);
    if (!link) throw this.unavailable();

    const expectedAmount = this.toWholeVnd(state.attempt.amount);
    const identityMatches =
      link.orderCode === state.attempt.providerOrderCode &&
      link.linkId === state.attempt.providerPaymentLinkId &&
      link.amount === expectedAmount;
    const aggregateIsValid =
      Number.isSafeInteger(link.amountPaid) &&
      link.amountPaid >= 0 &&
      Number.isSafeInteger(link.amountRemaining) &&
      link.amountRemaining >= 0;

    if (
      identityMatches &&
      aggregateIsValid &&
      link.status === 'PAID' &&
      link.amountPaid === expectedAmount &&
      link.amountRemaining === 0
    ) {
      await this.applyFullPayment(orderId, link);
      throw new ConflictException('The order has already been paid.');
    }

    if (
      !identityMatches ||
      !aggregateIsValid ||
      link.amountPaid > 0 ||
      link.amountRemaining !== expectedAmount
    ) {
      await this.markProviderLinkForReview(
        orderId,
        link,
        identityMatches
          ? 'PayOS cancellation found partial or inconsistent payment amounts.'
          : 'PayOS cancellation link identity or amount does not match the local attempt.',
      );
      throw this.unavailable();
    }

    if (!this.isNonPayableStatus(link.status)) {
      // Keep the local order and voucher reservation intact while the state is ambiguous.
      throw this.unavailable();
    }

    const result = await this.cancelAfterProviderConfirmation(
      customerId,
      orderId,
      link,
      'cancelled',
    );
    if (result !== 'cancelled') {
      if (result === 'paid') {
        throw new ConflictException('The order has already been paid.');
      }
      throw new ConflictException(
        'The order changed while PayOS cancellation was being confirmed.',
      );
    }
  }

  /** Reconciles due setup leases, unresolved attempts, and expired checkout links. */
  async reconcileScheduledAttempts(): Promise<void> {
    if (!this.isConfigured()) return;

    const now = new Date();
    const dueAttempts = await this.dataSource
      .getRepository(PaymentAttempt)
      .createQueryBuilder('attempt')
      .innerJoin('attempt.order', 'order')
      .select('attempt.orderId', 'orderId')
      .where('order.paymentMethod = :paymentMethod', {
        paymentMethod: 'payos',
      })
      .andWhere("order.paymentStatus = 'unpaid'")
      .andWhere("order.status = 'pending'")
      .andWhere('attempt.setupLeaseExpiresAt <= :now', { now })
      .andWhere(
        `(
          attempt.status IN (:...reconcilableStatuses)
          OR (attempt.status = 'pending' AND attempt.expiresAt <= :now)
        )`,
        { reconcilableStatuses: ['creating', 'reconciliation_required'] },
      )
      .orderBy('attempt.expiresAt', 'ASC')
      .getRawMany<{ orderId: number }>();

    for (const dueAttempt of dueAttempts) {
      try {
        const claimed = await this.claimScheduledAttempt(dueAttempt.orderId);
        if (!claimed) continue;
        await this.reconcileScheduledAttempt(dueAttempt.orderId, claimed);
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            orderId: dueAttempt.orderId,
            outcome: 'payos_reconciliation_retry',
            error: error instanceof Error ? error.name : 'UnknownProviderError',
          }),
        );
      }
    }
  }

  private assertCustomerCanCancelPayos(state: PaymentState): void {
    if (
      state.order.paymentMethod !== 'payos' ||
      state.order.status !== 'pending' ||
      state.order.paymentStatus !== 'unpaid' ||
      state.attempt.provider !== 'payos' ||
      state.attempt.status !== 'pending' ||
      this.hasPaymentEvidence(state.attempt) ||
      !state.attempt.providerPaymentLinkId ||
      !state.attempt.checkoutUrl
    ) {
      throw new ConflictException(
        'This PayOS order cannot be cancelled in its current payment state.',
      );
    }
  }

  private async loadOwnedState(
    customerId: number,
    orderId: number,
  ): Promise<PaymentState | null> {
    const order = await this.dataSource
      .getRepository(SalesOrder)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.paymentAttempt', 'attempt')
      .where('order.orderId = :orderId', { orderId })
      .andWhere('order.customerId = :customerId', { customerId })
      .getOne();
    if (!order) return null;
    if (!order.paymentAttempt) {
      throw new ConflictException(
        'This PayOS order cannot be cancelled in its current payment state.',
      );
    }
    return { order, attempt: order.paymentAttempt };
  }

  private async markProviderLinkForReview(
    orderId: number,
    link: PaymentProviderLink,
    reason: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (
        !state ||
        state.order.paymentMethod !== 'payos' ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        !['creating', 'pending', 'reconciliation_required'].includes(
          state.attempt.status,
        )
      ) {
        return;
      }
      await this.flagForReview(manager, state, link, reason);
    });
  }

  private async cancelAfterProviderConfirmation(
    customerId: number | null,
    orderId: number,
    link: PaymentProviderLink,
    terminalAttemptStatus: 'cancelled' | 'expired' | 'failed',
    allowedAttemptStatuses: string[] = ['pending'],
  ): Promise<'cancelled' | 'paid' | 'changed'> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (!state) return 'changed';
      if (customerId !== null && state.order.customerId !== customerId) {
        throw new NotFoundException('Order not found.');
      }
      if (state.order.paymentStatus === 'paid') return 'paid';

      const expectedAmount = this.toWholeVnd(state.attempt.amount);
      const canCancel =
        state.order.paymentMethod === 'payos' &&
        state.order.status === 'pending' &&
        state.order.paymentStatus === 'unpaid' &&
        allowedAttemptStatuses.includes(state.attempt.status) &&
        !this.hasPaymentEvidence(state.attempt) &&
        Boolean(state.attempt.providerPaymentLinkId) &&
        Boolean(state.attempt.checkoutUrl) &&
        state.attempt.providerPaymentLinkId === link.linkId &&
        state.attempt.providerOrderCode === link.orderCode &&
        link.amount === expectedAmount &&
        link.amountPaid === 0 &&
        link.amountRemaining === expectedAmount &&
        this.isNonPayableStatus(link.status);
      if (!canCancel) return 'changed';

      state.order.status = 'cancelled';
      state.attempt.status = terminalAttemptStatus;
      state.attempt.setupLeaseExpiresAt = new Date(0);
      state.attempt.reconciliationReason = null;
      state.attempt.reconciliationAt = null;
      await manager.getRepository(SalesOrder).save(state.order);
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      return 'cancelled';
    });
  }

  private isNonPayableStatus(status: PaymentProviderLink['status']): boolean {
    return (
      status === 'CANCELLED' || status === 'EXPIRED' || status === 'FAILED'
    );
  }

  private terminalAttemptStatus(
    status: PaymentProviderLink['status'],
  ): 'cancelled' | 'expired' | 'failed' {
    if (status === 'EXPIRED') return 'expired';
    if (status === 'FAILED') return 'failed';
    return 'cancelled';
  }

  private async claimScheduledAttempt(
    orderId: number,
  ): Promise<PaymentState | null> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      const now = Date.now();
      const due =
        state?.attempt.status === 'creating' ||
        state?.attempt.status === 'reconciliation_required' ||
        (state?.attempt.status === 'pending' &&
          state.attempt.expiresAt.getTime() <= now);
      if (
        !state ||
        !due ||
        state.order.paymentMethod !== 'payos' ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        state.attempt.setupLeaseExpiresAt.getTime() > now
      ) {
        return null;
      }

      state.attempt.setupLeaseExpiresAt = new Date(now + PAYOS_SETUP_LEASE_MS);
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      return state;
    });
  }

  private async reconcileScheduledAttempt(
    orderId: number,
    claimed: PaymentState,
  ): Promise<void> {
    let link: PaymentProviderLink | null;
    try {
      link = await this.provider.getLink(claimed.attempt.providerOrderCode);
    } catch (error) {
      // Keep local state and voucher reservation intact; the lease makes this retryable.
      this.logScheduledLookupFailure(orderId, 'initial_link_lookup', error);
      return;
    }

    if (!link) {
      await this.handleMissingScheduledLink(orderId, claimed);
      return;
    }

    await this.reconcileScheduledLink(orderId, claimed, link);
  }

  private async handleMissingScheduledLink(
    orderId: number,
    claimed: PaymentState,
  ): Promise<void> {
    const hasProviderEvidence =
      claimed.attempt.providerPaymentLinkId !== null ||
      claimed.attempt.checkoutUrl !== null ||
      claimed.attempt.providerReference !== null ||
      this.hasObservedFunds(claimed.attempt.observedAmountPaid);
    const canRetrySameCode =
      !hasProviderEvidence &&
      (claimed.attempt.status === 'creating' ||
        claimed.attempt.status === 'reconciliation_required');

    if (canRetrySameCode) {
      const retry = await this.prepareRetryAfterConfirmedNoLink(orderId);
      if (retry === 'expired') return;
      if (retry === 'creating') {
        await this.createLink(orderId, true);
        return;
      }
    }

    if (
      claimed.attempt.status === 'creating' &&
      claimed.attempt.expiresAt.getTime() <= Date.now() &&
      !hasProviderEvidence
    ) {
      await this.expireIfDueAndUnlinked(orderId);
      return;
    }

    await this.markReconciliationRequired(
      orderId,
      'PayOS payment link could not be found during scheduled reconciliation.',
    );
  }

  private async prepareRetryAfterConfirmedNoLink(
    orderId: number,
  ): Promise<'creating' | 'expired' | 'changed'> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (
        !state ||
        state.order.paymentMethod !== 'payos' ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        !['creating', 'reconciliation_required'].includes(
          state.attempt.status,
        ) ||
        state.attempt.providerPaymentLinkId !== null ||
        state.attempt.checkoutUrl !== null ||
        state.attempt.providerReference !== null ||
        this.hasObservedFunds(state.attempt.observedAmountPaid)
      ) {
        return 'changed';
      }

      if (state.attempt.expiresAt.getTime() <= Date.now()) {
        state.attempt.status = 'expired';
        state.attempt.setupLeaseExpiresAt = new Date(0);
        state.attempt.reconciliationReason = null;
        state.attempt.reconciliationAt = null;
        state.order.status = 'cancelled';
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        await manager.getRepository(SalesOrder).save(state.order);
        return 'expired';
      }

      state.attempt.status = 'creating';
      state.attempt.reconciliationReason = null;
      state.attempt.reconciliationAt = null;
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      return 'creating';
    });
  }

  private async reconcileScheduledLink(
    orderId: number,
    claimed: PaymentState,
    link: PaymentProviderLink,
  ): Promise<void> {
    const expectedAmount = this.toWholeVnd(claimed.attempt.amount);
    const identityMatches =
      link.orderCode === claimed.attempt.providerOrderCode &&
      link.amount === expectedAmount &&
      (claimed.attempt.providerPaymentLinkId === null ||
        claimed.attempt.providerPaymentLinkId === link.linkId);
    const aggregateIsValid =
      Number.isSafeInteger(link.amountPaid) &&
      link.amountPaid >= 0 &&
      Number.isSafeInteger(link.amountRemaining) &&
      link.amountRemaining >= 0;

    if (
      identityMatches &&
      aggregateIsValid &&
      link.status === 'PAID' &&
      link.amountPaid === expectedAmount &&
      link.amountRemaining === 0
    ) {
      await this.applyFullPayment(orderId, link);
      return;
    }

    if (this.hasPaymentEvidence(claimed.attempt)) {
      await this.markProviderLinkForReview(
        orderId,
        link,
        'Prior PayOS payment evidence remains unresolved; administrator review is required.',
      );
      return;
    }

    if (!identityMatches || !aggregateIsValid) {
      await this.markProviderLinkForReview(
        orderId,
        link,
        'PayOS scheduled reconciliation found a mismatched link or amount.',
      );
      return;
    }

    // An orphan without a saved URL is reserved for administrator review even when unpaid.
    if (!claimed.attempt.checkoutUrl) {
      await this.markProviderLinkForReview(
        orderId,
        link,
        'PayOS link exists without a locally saved checkout URL; administrator review is required.',
      );
      return;
    }

    const isUnpaidWholeLink =
      link.amountPaid === 0 && link.amountRemaining === expectedAmount;
    const beforeDeadline = claimed.attempt.expiresAt.getTime() > Date.now();
    if (
      beforeDeadline &&
      isUnpaidWholeLink &&
      link.status === 'PENDING' &&
      ['creating', 'pending', 'reconciliation_required'].includes(
        claimed.attempt.status,
      )
    ) {
      await this.confirmReusableCheckout(orderId, link);
      return;
    }

    if (isUnpaidWholeLink && this.isNonPayableStatus(link.status)) {
      await this.cancelAfterProviderConfirmation(
        null,
        orderId,
        link,
        this.terminalAttemptStatus(link.status),
        ['creating', 'pending', 'reconciliation_required'],
      );
      return;
    }

    if (isUnpaidWholeLink && !beforeDeadline) {
      await this.cancelExpiredKnownLink(orderId, claimed, link, expectedAmount);
      return;
    }

    await this.markProviderLinkForReview(
      orderId,
      link,
      'PayOS link state or aggregate amount requires administrator review.',
    );
  }

  private async cancelExpiredKnownLink(
    orderId: number,
    claimed: PaymentState,
    link: PaymentProviderLink,
    expectedAmount: number,
  ): Promise<void> {
    let confirmed = link;
    if (!this.isNonPayableStatus(link.status)) {
      try {
        await this.provider.cancelLink(
          claimed.attempt.providerOrderCode,
          'Payment link expired',
        );
      } catch {
        // Confirm current aggregate state below before making any local transition.
      }
      try {
        const refreshed = await this.provider.getLink(
          claimed.attempt.providerOrderCode,
        );
        if (!refreshed) {
          await this.markReconciliationRequired(
            orderId,
            'PayOS expired link could not be found after cancellation was requested.',
          );
          return;
        }
        confirmed = refreshed;
      } catch (error) {
        this.logScheduledLookupFailure(orderId, 'expiry_refresh_lookup', error);
        return;
      }
    }

    const confirmedIdentityMatches =
      confirmed.orderCode === claimed.attempt.providerOrderCode &&
      confirmed.linkId === claimed.attempt.providerPaymentLinkId &&
      confirmed.amount === expectedAmount;
    const aggregateIsValid =
      Number.isSafeInteger(confirmed.amountPaid) &&
      confirmed.amountPaid >= 0 &&
      Number.isSafeInteger(confirmed.amountRemaining) &&
      confirmed.amountRemaining >= 0;

    if (
      confirmedIdentityMatches &&
      aggregateIsValid &&
      confirmed.status === 'PAID' &&
      confirmed.amountPaid === expectedAmount &&
      confirmed.amountRemaining === 0
    ) {
      await this.applyFullPayment(orderId, confirmed);
      return;
    }

    if (
      confirmedIdentityMatches &&
      aggregateIsValid &&
      confirmed.amountPaid === 0 &&
      confirmed.amountRemaining === expectedAmount &&
      this.isNonPayableStatus(confirmed.status)
    ) {
      await this.cancelAfterProviderConfirmation(
        null,
        orderId,
        confirmed,
        this.terminalAttemptStatus(confirmed.status),
        ['creating', 'pending', 'reconciliation_required'],
      );
      return;
    }

    await this.markProviderLinkForReview(
      orderId,
      confirmed,
      'PayOS expiry cancellation is incomplete or its final state is inconsistent.',
    );
  }

  private hasObservedFunds(amount: string | null): boolean {
    if (amount === null) return false;
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
    if (!match) return true;
    try {
      const cents =
        BigInt(match[1]) * 100n +
        BigInt((match[2] ?? '').padEnd(2, '0') || '0');
      return cents > 0n;
    } catch {
      return true;
    }
  }

  private logScheduledLookupFailure(
    orderId: number,
    stage: string,
    error: unknown,
  ): void {
    this.logger.warn(
      JSON.stringify({
        orderId,
        stage,
        outcome: 'provider_lookup_retry',
        error: error instanceof Error ? error.name : 'UnknownProviderError',
      }),
    );
  }

  private observedAmountExceedsVnd(
    observedAmount: string | null,
    expectedAmountVnd: number,
  ): boolean {
    if (observedAmount === null) return false;
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(observedAmount);
    if (!match) return true;
    const observedCents =
      BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
    return observedCents > BigInt(expectedAmountVnd) * 100n;
  }

  private hasPaymentEvidence(
    attempt: Pick<PaymentAttempt, 'providerReference' | 'observedAmountPaid'>,
  ): boolean {
    return (
      attempt.providerReference !== null ||
      this.hasObservedFunds(attempt.observedAmountPaid)
    );
  }

  private recordObservedAmountPaid(
    attempt: PaymentAttempt,
    amountPaid: number,
  ): void {
    if (!Number.isSafeInteger(amountPaid) || amountPaid < 0) return;

    const prior = attempt.observedAmountPaid;
    if (prior !== null) {
      const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(prior);
      if (!match) return;
      const priorCents =
        BigInt(match[1]) * 100n +
        BigInt((match[2] ?? '').padEnd(2, '0') || '0');
      if (BigInt(amountPaid) * 100n < priorCents) return;
    }

    attempt.observedAmountPaid = String(amountPaid);
  }

  private async createLink(
    orderId: number,
    scheduledReconciliation = false,
  ): Promise<void> {
    const state = await this.refreshInitialLease(orderId);
    if (!state) {
      const current = await this.loadState(orderId);
      if (
        current &&
        (current.order.status !== 'pending' ||
          current.order.paymentStatus === 'paid' ||
          current.attempt.status === 'paid')
      ) {
        return;
      }
      if (current && current.attempt.status === 'creating') {
        const found = await this.lookupLink(
          current.attempt.providerOrderCode,
          scheduledReconciliation
            ? { orderId, stage: 'create_lease_recovery_lookup' }
            : undefined,
        );
        if (found) {
          await this.reconcileFoundLink(orderId, found);
        } else {
          await this.expireIfDueAndUnlinked(orderId);
        }
      }
      throw this.unavailable();
    }

    const input = {
      orderCode: state.attempt.providerOrderCode,
      amount: this.toWholeVnd(state.attempt.amount),
      expiresAt: state.attempt.expiresAt,
    };

    let created: PaymentProviderLink;
    try {
      created = await this.provider.createLink(input);
    } catch {
      // A create timeout or duplicate order code can mean PayOS created the link.
      const found = await this.lookupLink(
        input.orderCode,
        scheduledReconciliation
          ? { orderId, stage: 'create_failure_lookup' }
          : undefined,
      );
      if (found) {
        const outcome = await this.reconcileFoundLink(orderId, found);
        if (outcome === 'paid') return;
      } else {
        await this.expireIfDueAndUnlinked(orderId);
      }
      throw this.unavailable();
    }

    const expectedAmount = input.amount;
    const identityMatches =
      created.orderCode === input.orderCode &&
      created.amount === expectedAmount &&
      created.linkId.length > 0;
    const fullyPaid =
      identityMatches &&
      created.status === 'PAID' &&
      created.amountPaid === expectedAmount &&
      created.amountRemaining === 0;

    if (fullyPaid) {
      const outcome = await this.applyFullPayment(orderId, created);
      if (outcome === 'paid') return;
      throw this.unavailable();
    }

    const pristinePending =
      identityMatches &&
      created.status === 'PENDING' &&
      created.amountPaid === 0 &&
      created.amountRemaining === expectedAmount &&
      Boolean(created.checkoutUrl);

    const outcome = await this.persistCreatedLink(
      orderId,
      created,
      pristinePending,
    );
    if (outcome !== 'available') throw this.unavailable();
  }

  private async refreshInitialLease(
    orderId: number,
  ): Promise<PaymentState | null> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (
        !state ||
        state.order.paymentMethod !== 'payos' ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        state.attempt.status !== 'creating' ||
        this.hasPaymentEvidence(state.attempt) ||
        state.attempt.expiresAt.getTime() <= Date.now()
      ) {
        return null;
      }

      state.attempt.setupLeaseExpiresAt = new Date(
        Date.now() + PAYOS_SETUP_LEASE_MS,
      );
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      return state;
    });
  }

  private async claimRetryLease(
    orderId: number,
  ): Promise<'claimed' | 'busy' | 'expired' | 'terminal'> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (
        !state ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        state.attempt.status !== 'creating' ||
        this.hasPaymentEvidence(state.attempt)
      ) {
        return 'terminal';
      }

      const now = Date.now();
      if (state.attempt.expiresAt.getTime() <= now) {
        if (
          state.attempt.providerPaymentLinkId !== null ||
          state.attempt.checkoutUrl !== null ||
          state.attempt.providerReference !== null ||
          this.hasObservedFunds(state.attempt.observedAmountPaid)
        ) {
          return 'terminal';
        }
        state.attempt.status = 'expired';
        state.attempt.setupLeaseExpiresAt = new Date(0);
        state.attempt.reconciliationReason = null;
        state.attempt.reconciliationAt = null;
        state.order.status = 'cancelled';
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        await manager.getRepository(SalesOrder).save(state.order);
        return 'expired';
      }

      if (state.attempt.setupLeaseExpiresAt.getTime() > now) return 'busy';
      state.attempt.setupLeaseExpiresAt = new Date(now + PAYOS_SETUP_LEASE_MS);
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      return 'claimed';
    });
  }

  private async persistCreatedLink(
    orderId: number,
    link: PaymentProviderLink,
    pristinePending: boolean,
  ): Promise<'available' | 'paid' | 'attention'> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (!state) return 'attention';

      if (
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        state.attempt.status !== 'creating'
      ) {
        return 'attention';
      }

      const stillBeforeDeadline =
        state.attempt.expiresAt.getTime() > Date.now();
      const identityMatches =
        link.orderCode === state.attempt.providerOrderCode &&
        link.amount === this.toWholeVnd(state.attempt.amount);

      state.attempt.providerPaymentLinkId = link.linkId || null;
      if (
        pristinePending &&
        identityMatches &&
        stillBeforeDeadline &&
        !this.hasPaymentEvidence(state.attempt)
      ) {
        state.attempt.status = 'pending';
        state.attempt.checkoutUrl = link.checkoutUrl;
        state.attempt.setupLeaseExpiresAt = new Date(0);
        state.attempt.reconciliationReason = null;
        state.attempt.reconciliationAt = null;
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        return 'available';
      }

      state.attempt.checkoutUrl = null;
      state.attempt.status = 'reconciliation_required';
      this.recordObservedAmountPaid(state.attempt, link.amountPaid);
      state.attempt.reconciliationReason = stillBeforeDeadline
        ? 'PayOS returned a payment link with unexpected amount or status.'
        : 'PayOS created a payment link after the local payment deadline.';
      state.attempt.reconciliationAt = new Date();
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      return 'attention';
    });
  }

  private async reconcileFoundLink(
    orderId: number,
    link: PaymentProviderLink,
  ): Promise<'paid' | 'available' | 'attention'> {
    const state = await this.loadState(orderId);
    if (!state) return 'attention';
    const expectedAmount = this.toWholeVnd(state.attempt.amount);
    const identityMatches =
      link.orderCode === state.attempt.providerOrderCode &&
      link.amount === expectedAmount &&
      (state.attempt.providerPaymentLinkId === null ||
        state.attempt.providerPaymentLinkId === link.linkId);

    if (
      identityMatches &&
      link.status === 'PAID' &&
      link.amountPaid === expectedAmount &&
      link.amountRemaining === 0
    ) {
      return this.applyFullPayment(orderId, link);
    }

    const eligibleForCheckout =
      identityMatches &&
      state.order.status === 'pending' &&
      state.order.paymentStatus === 'unpaid' &&
      !this.hasPaymentEvidence(state.attempt) &&
      ['creating', 'pending', 'reconciliation_required'].includes(
        state.attempt.status,
      ) &&
      state.attempt.expiresAt.getTime() > Date.now() &&
      Boolean(state.attempt.checkoutUrl) &&
      link.status === 'PENDING' &&
      link.amountPaid === 0 &&
      link.amountRemaining === expectedAmount;

    if (eligibleForCheckout) {
      return this.confirmReusableCheckout(orderId, link);
    }

    await this.markReconciliationRequired(
      orderId,
      identityMatches
        ? 'PayOS link state or aggregate amount requires administrator review.'
        : 'PayOS link identity or amount does not match the local payment attempt.',
      link,
    );
    return 'attention';
  }

  private async confirmReusableCheckout(
    orderId: number,
    link: PaymentProviderLink,
  ): Promise<'available' | 'attention'> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (!state) return 'attention';

      const expectedAmount = this.toWholeVnd(state.attempt.amount);
      const stillReusable =
        state.order.paymentMethod === 'payos' &&
        state.order.status === 'pending' &&
        state.order.paymentStatus === 'unpaid' &&
        !this.hasPaymentEvidence(state.attempt) &&
        ['creating', 'pending', 'reconciliation_required'].includes(
          state.attempt.status,
        ) &&
        state.attempt.expiresAt.getTime() > Date.now() &&
        Boolean(state.attempt.checkoutUrl) &&
        state.attempt.providerOrderCode === link.orderCode &&
        (state.attempt.providerPaymentLinkId === null ||
          state.attempt.providerPaymentLinkId === link.linkId) &&
        link.amount === expectedAmount &&
        link.status === 'PENDING' &&
        link.amountPaid === 0 &&
        link.amountRemaining === expectedAmount;
      if (stillReusable) {
        state.attempt.status = 'pending';
        state.attempt.setupLeaseExpiresAt = new Date(0);
        state.attempt.reconciliationReason = null;
        state.attempt.reconciliationAt = null;
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        return 'available';
      }

      if (
        state.order.status === 'pending' &&
        state.order.paymentStatus === 'unpaid' &&
        ['creating', 'pending', 'reconciliation_required'].includes(
          state.attempt.status,
        )
      ) {
        return this.flagForReview(
          manager,
          state,
          link,
          'PayOS link changed while the customer retry was being reconciled.',
        );
      }
      return 'attention';
    });
  }

  private async applyFullPayment(
    orderId: number,
    link: PaymentProviderLink,
    webhookReference?: string,
  ): Promise<'paid' | 'attention'> {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (!state) return 'attention';

      const expectedAmount = this.toWholeVnd(state.attempt.amount);
      const matches =
        link.orderCode === state.attempt.providerOrderCode &&
        link.amount === expectedAmount &&
        link.status === 'PAID' &&
        link.amountPaid === expectedAmount &&
        link.amountRemaining === 0 &&
        (state.attempt.providerPaymentLinkId === null ||
          state.attempt.providerPaymentLinkId === link.linkId);
      if (!matches) {
        return this.flagForReview(
          manager,
          state,
          link,
          'PayOS full-payment reconciliation did not match the local attempt.',
          webhookReference,
        );
      }

      const reference =
        webhookReference ?? link.transactionReferences[0] ?? null;
      if (
        state.order.status === 'pending' &&
        state.order.paymentStatus === 'unpaid' &&
        ['creating', 'pending', 'reconciliation_required'].includes(
          state.attempt.status,
        )
      ) {
        if (
          this.observedAmountExceedsVnd(
            state.attempt.observedAmountPaid,
            expectedAmount,
          )
        ) {
          const priorObservedAmount = state.attempt.observedAmountPaid;
          return this.flagForReview(
            manager,
            state,
            link,
            `PayOS aggregate paid amount is below the previously observed amount (${priorObservedAmount} > ${expectedAmount}); administrator review is required.`,
            state.attempt.providerReference ?? reference,
          );
        }

        if (
          reference &&
          (await this.referenceBelongsToAnotherAttempt(
            manager,
            state.attempt.paymentAttemptId,
            reference,
          ))
        ) {
          return this.flagForReview(
            manager,
            state,
            link,
            REFERENCE_CONFLICT_REASON,
            reference,
          );
        }
        state.order.paymentStatus = 'paid';
        state.order.paymentConfirmedAt = new Date();
        state.order.paymentConfirmedByEmployeeId = null;
        state.attempt.status = 'paid';
        state.attempt.setupLeaseExpiresAt = new Date(0);
        if (state.attempt.providerPaymentLinkId === null) {
          state.attempt.checkoutUrl = null;
        }
        state.attempt.providerPaymentLinkId = link.linkId;
        state.attempt.providerReference = reference;
        this.recordObservedAmountPaid(state.attempt, link.amountPaid);
        state.attempt.paidAt = new Date();
        state.attempt.reconciliationReason = null;
        state.attempt.reconciliationAt = null;
        await manager.getRepository(SalesOrder).save(state.order);
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        await this.invoices.issueForPaidOrder(manager, state.order.orderId);
        return 'paid';
      }

      if (
        state.order.paymentStatus === 'paid' &&
        state.attempt.status === 'paid' &&
        (state.attempt.providerReference === reference || reference === null)
      ) {
        if (state.attempt.providerPaymentLinkId === null) {
          state.attempt.providerPaymentLinkId = link.linkId;
          state.attempt.checkoutUrl = null;
          await manager.getRepository(PaymentAttempt).save(state.attempt);
        }
        return 'paid';
      }

      if (
        state.order.paymentStatus === 'paid' &&
        state.attempt.status === 'paid' &&
        state.attempt.providerReference === null &&
        reference !== null
      ) {
        if (
          await this.referenceBelongsToAnotherAttempt(
            manager,
            state.attempt.paymentAttemptId,
            reference,
          )
        ) {
          return this.flagForReview(
            manager,
            state,
            link,
            REFERENCE_CONFLICT_REASON,
            reference,
          );
        }
        state.attempt.providerReference = reference;
        if (state.attempt.providerPaymentLinkId === null) {
          state.attempt.providerPaymentLinkId = link.linkId;
          state.attempt.checkoutUrl = null;
        }
        this.recordObservedAmountPaid(state.attempt, link.amountPaid);
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        return 'paid';
      }

      return this.flagForReview(
        manager,
        state,
        link,
        'PayOS reports a full payment for an order that is no longer eligible for settlement.',
        webhookReference,
      );
    });
  }

  private async markReconciliationRequired(
    orderId: number,
    reason: string,
    link?: PaymentProviderLink,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (
        !state ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        !['creating', 'pending', 'reconciliation_required'].includes(
          state.attempt.status,
        )
      ) {
        return;
      }
      state.attempt.status = 'reconciliation_required';
      if (link) {
        state.attempt.providerPaymentLinkId = link.linkId || null;
        this.recordObservedAmountPaid(state.attempt, link.amountPaid);
        const reference = link.transactionReferences[0];
        if (reference) {
          const referenceConflict = await this.referenceBelongsToAnotherAttempt(
            manager,
            state.attempt.paymentAttemptId,
            reference,
          );
          if (referenceConflict) {
            reason = `${reason} ${REFERENCE_CONFLICT_REASON}`;
          } else {
            state.attempt.providerReference = reference;
          }
        }
      }
      state.attempt.reconciliationReason = reason;
      state.attempt.reconciliationAt = new Date();
      await manager.getRepository(PaymentAttempt).save(state.attempt);
    });
  }

  private async flagForReview(
    manager: EntityManager,
    state: PaymentState,
    link: PaymentProviderLink,
    reason: string,
    referenceOverride?: string | null,
  ): Promise<'attention'> {
    state.attempt.status = 'reconciliation_required';
    if (
      state.attempt.providerPaymentLinkId === null &&
      link.orderCode === state.attempt.providerOrderCode
    ) {
      state.attempt.checkoutUrl = null;
      state.attempt.providerPaymentLinkId = link.linkId || null;
    }
    const providerReference =
      referenceOverride ?? link.transactionReferences[0] ?? null;
    if (providerReference) {
      const referenceConflict = await this.referenceBelongsToAnotherAttempt(
        manager,
        state.attempt.paymentAttemptId,
        providerReference,
      );
      if (referenceConflict) {
        if (!reason.includes(REFERENCE_CONFLICT_REASON)) {
          reason = `${reason} ${REFERENCE_CONFLICT_REASON}`;
        }
      } else {
        state.attempt.providerReference = providerReference;
      }
    }
    this.recordObservedAmountPaid(state.attempt, link.amountPaid);
    state.attempt.reconciliationReason = reason;
    state.attempt.reconciliationAt = new Date();
    await manager.getRepository(PaymentAttempt).save(state.attempt);
    return 'attention';
  }

  private async flagWebhookForReview(
    originalState: PaymentState,
    event: VerifiedPaymentWebhook,
    link: PaymentProviderLink | null,
    reason: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, originalState.order.orderId);
      const localLinkIdentityMatches =
        state?.attempt.providerPaymentLinkId === event.data.paymentLinkId ||
        (state?.attempt.providerPaymentLinkId === null &&
          originalState.attempt.providerPaymentLinkId === null);
      if (
        !state ||
        state.attempt.paymentAttemptId !==
          originalState.attempt.paymentAttemptId ||
        state.order.paymentMethod !== 'payos' ||
        state.attempt.provider !== 'payos' ||
        state.attempt.providerOrderCode !== event.data.orderCode ||
        !localLinkIdentityMatches ||
        state.attempt.amount !== originalState.attempt.amount
      ) {
        return;
      }

      if (
        state.order.paymentStatus === 'paid' &&
        state.attempt.status === 'paid' &&
        state.attempt.providerReference === event.data.reference
      ) {
        return;
      }

      state.attempt.status = 'reconciliation_required';
      const providerLinkMatchesEvent =
        link?.orderCode === event.data.orderCode &&
        link.linkId === event.data.paymentLinkId;
      if (providerLinkMatchesEvent) {
        state.attempt.providerPaymentLinkId = link.linkId;
        if (originalState.attempt.providerPaymentLinkId === null) {
          state.attempt.checkoutUrl = null;
        }
      }
      if (link) this.recordObservedAmountPaid(state.attempt, link.amountPaid);

      const referenceConflict = await this.referenceBelongsToAnotherAttempt(
        manager,
        state.attempt.paymentAttemptId,
        event.data.reference,
      );
      if (!referenceConflict) {
        state.attempt.providerReference = event.data.reference;
      } else {
        reason = `${reason} ${REFERENCE_CONFLICT_REASON}`;
      }
      state.attempt.reconciliationReason = reason;
      state.attempt.reconciliationAt = new Date();
      await manager.getRepository(PaymentAttempt).save(state.attempt);
    });
  }

  private async referenceBelongsToAnotherAttempt(
    manager: EntityManager,
    paymentAttemptId: number,
    reference: string,
  ): Promise<boolean> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), 9137)', [
      reference,
    ]);
    const existing = await manager
      .getRepository(PaymentAttempt)
      .createQueryBuilder('otherAttempt')
      .where('otherAttempt.providerReference = :reference', { reference })
      .andWhere('otherAttempt.paymentAttemptId <> :paymentAttemptId', {
        paymentAttemptId,
      })
      .getOne();
    return existing !== null;
  }

  private async loadStateByProviderOrderCode(
    orderCode: number,
  ): Promise<PaymentState | null> {
    const order = await this.dataSource
      .getRepository(SalesOrder)
      .createQueryBuilder('order')
      .innerJoinAndSelect('order.paymentAttempt', 'attempt')
      .where('attempt.providerOrderCode = :orderCode', { orderCode })
      .getOne();
    if (!order || !order.paymentAttempt) return null;
    return { order, attempt: order.paymentAttempt };
  }

  private acknowledgeWebhook(): { success: true } {
    return { success: true };
  }

  private logWebhookOutcome(
    event: VerifiedPaymentWebhook,
    reason: string,
  ): void {
    this.logger.warn(
      JSON.stringify({
        orderCode: Number.isSafeInteger(event.data.orderCode)
          ? event.data.orderCode
          : null,
        paymentLinkId:
          typeof event.data.paymentLinkId === 'string' &&
          event.data.paymentLinkId.length <= 255
            ? event.data.paymentLinkId
            : null,
        reference:
          typeof event.data.reference === 'string' &&
          event.data.reference.length <= 255
            ? event.data.reference
            : null,
        amount: Number.isSafeInteger(event.data.amount)
          ? event.data.amount
          : null,
        currency:
          typeof event.data.currency === 'string' &&
          event.data.currency.length <= 16
            ? event.data.currency
            : null,
        reason,
      }),
    );
  }

  private async expireIfDueAndUnlinked(orderId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (
        !state ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        !['creating', 'reconciliation_required'].includes(
          state.attempt.status,
        ) ||
        state.attempt.providerPaymentLinkId !== null ||
        state.attempt.checkoutUrl !== null ||
        state.attempt.providerReference !== null ||
        this.hasObservedFunds(state.attempt.observedAmountPaid) ||
        state.attempt.expiresAt.getTime() > Date.now()
      ) {
        return;
      }
      state.attempt.status = 'expired';
      state.attempt.setupLeaseExpiresAt = new Date(0);
      state.attempt.reconciliationReason = null;
      state.attempt.reconciliationAt = null;
      state.order.status = 'cancelled';
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      await manager.getRepository(SalesOrder).save(state.order);
    });
  }

  private async lookupLink(
    orderCode: number,
    scheduledContext?: { orderId: number; stage: string },
  ): Promise<PaymentProviderLink | null> {
    try {
      return await this.provider.getLink(orderCode);
    } catch (error) {
      if (scheduledContext) {
        this.logScheduledLookupFailure(
          scheduledContext.orderId,
          scheduledContext.stage,
          error,
        );
      }
      throw this.unavailable();
    }
  }

  private async loadState(orderId: number): Promise<PaymentState | null> {
    const order = await this.dataSource
      .getRepository(SalesOrder)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.paymentAttempt', 'attempt')
      .where('order.orderId = :orderId', { orderId })
      .getOne();
    if (!order || !order.paymentAttempt) return null;
    return { order, attempt: order.paymentAttempt };
  }

  private async lockState(
    manager: EntityManager,
    orderId: number,
  ): Promise<PaymentState | null> {
    const order = await manager
      .getRepository(SalesOrder)
      .createQueryBuilder('order')
      .where('order.orderId = :orderId', { orderId })
      .setLock('pessimistic_write')
      .getOne();
    if (!order) return null;

    const attempt = await manager
      .getRepository(PaymentAttempt)
      .createQueryBuilder('attempt')
      .where('attempt.orderId = :orderId', { orderId })
      .setLock('pessimistic_write')
      .getOne();
    if (!attempt) return null;
    return { order, attempt };
  }

  private toWholeVnd(amount: string): number {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
    if (!match) {
      throw new InternalServerErrorException(
        'PayOS attempt amount is invalid.',
      );
    }
    const cents =
      BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
    const wholeVnd = cents / 100n;
    if (cents % 100n !== 0n || wholeVnd <= 0n || wholeVnd > MAX_SAFE_VND) {
      throw new InternalServerErrorException(
        'PayOS attempt amount must be a positive whole-VND safe integer.',
      );
    }
    return Number(wholeVnd);
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'PayOS checkout is unavailable while payment state is being reconciled.',
    );
  }
}
