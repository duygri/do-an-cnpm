import {
  Inject,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PAYMENT_PROVIDER, PAYOS_SETUP_LEASE_MS } from './payment-provider';
import type { PaymentProvider, PaymentProviderLink } from './payment-provider';

const MAX_SAFE_VND = BigInt(Number.MAX_SAFE_INTEGER);

type PaymentState = { order: SalesOrder; attempt: PaymentAttempt };

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PAYMENT_PROVIDER)
    private readonly provider: PaymentProvider,
    private readonly dataSource: DataSource,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  /** Starts a new link, or safely resumes the single attempt for an existing order. */
  async startOrResume(orderId: number, isNewOrder: boolean): Promise<void> {
    let state = await this.loadState(orderId);
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

  private async createLink(orderId: number): Promise<void> {
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
        const found = await this.lookupLink(current.attempt.providerOrderCode);
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
      const found = await this.lookupLink(input.orderCode);
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
        state.attempt.status !== 'creating'
      ) {
        return 'terminal';
      }

      const now = Date.now();
      if (state.attempt.expiresAt.getTime() <= now) {
        state.attempt.status = 'expired';
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
      if (pristinePending && identityMatches && stillBeforeDeadline) {
        state.attempt.status = 'pending';
        state.attempt.checkoutUrl = link.checkoutUrl;
        state.attempt.reconciliationReason = null;
        state.attempt.reconciliationAt = null;
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        return 'available';
      }

      state.attempt.checkoutUrl = null;
      state.attempt.status = 'reconciliation_required';
      state.attempt.observedAmountPaid = String(link.amountPaid);
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
      state.attempt.status === 'pending' &&
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
        state.attempt.status === 'pending' &&
        state.attempt.expiresAt.getTime() > Date.now() &&
        Boolean(state.attempt.checkoutUrl) &&
        state.attempt.providerOrderCode === link.orderCode &&
        (state.attempt.providerPaymentLinkId === null ||
          state.attempt.providerPaymentLinkId === link.linkId) &&
        link.amount === expectedAmount &&
        link.status === 'PENDING' &&
        link.amountPaid === 0 &&
        link.amountRemaining === expectedAmount;
      if (stillReusable) return 'available';

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
        );
      }

      const reference = link.transactionReferences[0] ?? null;
      if (
        state.order.status === 'pending' &&
        state.order.paymentStatus === 'unpaid' &&
        ['creating', 'pending', 'reconciliation_required'].includes(
          state.attempt.status,
        )
      ) {
        state.order.paymentStatus = 'paid';
        state.order.paymentConfirmedAt = new Date();
        state.order.paymentConfirmedByEmployeeId = null;
        state.attempt.status = 'paid';
        state.attempt.providerPaymentLinkId = link.linkId;
        state.attempt.providerReference = reference;
        state.attempt.observedAmountPaid = String(link.amountPaid);
        state.attempt.paidAt = new Date();
        state.attempt.reconciliationReason = null;
        state.attempt.reconciliationAt = null;
        await manager.getRepository(SalesOrder).save(state.order);
        await manager.getRepository(PaymentAttempt).save(state.attempt);
        return 'paid';
      }

      if (
        state.order.paymentStatus === 'paid' &&
        state.attempt.status === 'paid' &&
        (state.attempt.providerReference === reference || reference === null)
      ) {
        return 'paid';
      }

      return this.flagForReview(
        manager,
        state,
        link,
        'PayOS reports a full payment for an order that is no longer eligible for settlement.',
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
        state.attempt.observedAmountPaid = String(link.amountPaid);
        state.attempt.providerReference =
          link.transactionReferences[0] ?? state.attempt.providerReference;
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
  ): Promise<'attention'> {
    state.attempt.status = 'reconciliation_required';
    state.attempt.providerPaymentLinkId = link.linkId || null;
    state.attempt.providerReference =
      link.transactionReferences[0] ?? state.attempt.providerReference;
    state.attempt.observedAmountPaid = String(link.amountPaid);
    state.attempt.reconciliationReason = reason;
    state.attempt.reconciliationAt = new Date();
    await manager.getRepository(PaymentAttempt).save(state.attempt);
    return 'attention';
  }

  private async expireIfDueAndUnlinked(orderId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, orderId);
      if (
        !state ||
        state.order.status !== 'pending' ||
        state.order.paymentStatus !== 'unpaid' ||
        state.attempt.status !== 'creating' ||
        state.attempt.expiresAt.getTime() > Date.now()
      ) {
        return;
      }
      state.attempt.status = 'expired';
      state.attempt.reconciliationReason = null;
      state.attempt.reconciliationAt = null;
      state.order.status = 'cancelled';
      await manager.getRepository(PaymentAttempt).save(state.attempt);
      await manager.getRepository(SalesOrder).save(state.order);
    });
  }

  private async lookupLink(
    orderCode: number,
  ): Promise<PaymentProviderLink | null> {
    try {
      return await this.provider.getLink(orderCode);
    } catch {
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
