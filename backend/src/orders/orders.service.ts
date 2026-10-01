import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { Promotion } from '../promotions/entities/promotion.entity';
import { PromotionDetail } from '../promotions/entities/promotion-detail.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderDetail } from './entities/order-detail.entity';
import { SalesOrder } from './entities/sales-order.entity';
import { GetOrdersDto } from './dto/get-orders.dto';
import { PaymentAttempt } from '../payments/entities/payment-attempt.entity';
import { PaymentsService } from '../payments/payments.service';
import { PAYOS_SETUP_LEASE_MS } from '../payments/payment-provider';
import { InvoicesService } from '../invoices/invoices.service';

const UNIT_PRICE_PRECISION = 12;
const SUBTOTAL_PRECISION = 22;
const TOTAL_PRECISION = 24;

interface PricedOrderLine {
  variantId: number;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

type CustomerOrderDetailResponse = Pick<
  OrderDetail,
  'orderId' | 'variantId' | 'quantity' | 'unitPrice' | 'subtotal'
> & {
  productName: string;
  size: string | null;
  color: string | null;
};

type CustomerOrderResponse = Omit<
  SalesOrder,
  | 'paymentAttempt'
  | 'idempotencyKey'
  | 'requestFingerprint'
  | 'paymentMethod'
  | 'details'
> & {
  paymentMethod: Exclude<SalesOrder['paymentMethod'], null>;
  voucherCode: string | null;
  details?: CustomerOrderDetailResponse[];
  checkoutUrl?: string;
  paymentExpiresAt?: Date;
};

type CreateOrderResult = { orderId: number; created: boolean };

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly payments: PaymentsService,
    private readonly invoices: InvoicesService,
  ) {}

  async createOrder(
    input: CreateOrderDto,
    customerId: number,
    rawIdempotencyKey?: string,
  ): Promise<CustomerOrderResponse> {
    const paymentMethod = input.paymentMethod ?? 'cod';
    const idempotencyKey =
      paymentMethod === 'payos'
        ? this.validateIdempotencyKey(rawIdempotencyKey)
        : null;
    const requestFingerprint =
      idempotencyKey === null
        ? null
        : this.createRequestFingerprint(input, paymentMethod);

    if (idempotencyKey !== null) {
      const existing = await this.findByIdempotencyKey(
        this.dataSource.manager,
        customerId,
        idempotencyKey,
      );
      if (existing) {
        this.assertMatchingFingerprint(existing, requestFingerprint!);
        await this.payments.startOrResume(existing.orderId, false);
        return this.getOrder(customerId, String(existing.orderId));
      }
    }

    const sortedDetails = [...input.details].sort(
      (left, right) => left.variantId - right.variantId,
    );
    const variantIds = sortedDetails.map((detail) => detail.variantId);

    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'A variant may appear only once per order.',
      );
    }

    let result: CreateOrderResult;
    try {
      result = await this.dataSource.transaction(async (manager) => {
        if (idempotencyKey !== null) {
          const existing = await this.findByIdempotencyKey(
            manager,
            customerId,
            idempotencyKey,
          );
          if (existing) {
            this.assertMatchingFingerprint(existing, requestFingerprint!);
            return { orderId: existing.orderId, created: false };
          }
        }

        const variants = await manager
          .getRepository(ProductVariant)
          .createQueryBuilder('variant')
          .innerJoinAndSelect('variant.product', 'product')
          .where('variant.variantId IN (:...variantIds)', { variantIds })
          .orderBy('variant.variantId', 'ASC')
          .getMany();
        const variantsById = new Map(
          variants.map((variant) => [variant.variantId, variant]),
        );

        for (const variantId of variantIds) {
          const variant = variantsById.get(variantId);
          if (!variant) {
            throw new NotFoundException(
              `Product variant ${variantId} was not found.`,
            );
          }
          if (variant.product.status !== 'active') {
            throw new BadRequestException(
              `Product variant ${variantId} is unavailable because its product is inactive.`,
            );
          }
        }

        let totalCents = 0n;
        const pricedLines: PricedOrderLine[] = [];

        for (const detail of sortedDetails) {
          const variant = variantsById.get(detail.variantId)!;
          const unitPriceCents = this.parseUnitPrice(
            variant.price,
            detail.variantId,
          );
          const subtotalCents = unitPriceCents * BigInt(detail.quantity);
          this.assertFitsNumeric(
            subtotalCents,
            SUBTOTAL_PRECISION,
            `Subtotal for product variant ${detail.variantId}`,
          );
          totalCents += subtotalCents;

          pricedLines.push({
            variantId: detail.variantId,
            quantity: detail.quantity,
            unitPrice: this.formatCents(unitPriceCents),
            subtotal: this.formatCents(subtotalCents),
          });
        }

        let voucherId: number | null = null;
        let discountCents = 0n;
        if (input.voucherCode !== undefined && input.voucherCode !== null) {
          const voucherResult = await this.resolveVoucher(
            manager,
            input.voucherCode,
            totalCents,
            idempotencyKey === null
              ? undefined
              : {
                  customerId,
                  idempotencyKey,
                  requestFingerprint: requestFingerprint!,
                },
          );
          if (voucherResult.existingOrderId !== undefined) {
            return { orderId: voucherResult.existingOrderId, created: false };
          }
          voucherId = voucherResult.voucher.voucherId;
          discountCents = voucherResult.discountCents;
        }

        const shippingFeeCents = 0n;
        const orderTotalCents = totalCents - discountCents + shippingFeeCents;

        this.assertFitsNumeric(orderTotalCents, TOTAL_PRECISION, 'Order total');

        let payosAmount: bigint | null = null;
        if (paymentMethod === 'payos') {
          if (orderTotalCents % 100n !== 0n) {
            throw new BadRequestException(
              'PayOS requires the final order total to be a whole amount in VND.',
            );
          }
          payosAmount = orderTotalCents / 100n;
          if (payosAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new BadRequestException(
              'PayOS order total exceeds the supported exact integer VND amount.',
            );
          }
          if (payosAmount > 0n && !this.payments.isConfigured()) {
            throw new ServiceUnavailableException(
              'PayOS payment provider is not configured.',
            );
          }
        }

        const orderRepository = manager.getRepository(SalesOrder);
        const isZeroTotalPayos =
          paymentMethod === 'payos' && payosAmount === 0n;
        const order = await orderRepository.save(
          orderRepository.create({
            customerId,
            voucherId,
            recipientName: input.recipientName,
            recipientPhone: input.recipientPhone,
            shippingAddress: input.shippingAddress,
            discountAmount: this.formatCents(discountCents),
            shippingFee: this.formatCents(shippingFeeCents),
            totalAmount: this.formatCents(orderTotalCents),
            paymentMethod,
            paymentStatus: isZeroTotalPayos ? 'paid' : 'unpaid',
            paymentConfirmedAt: isZeroTotalPayos ? new Date() : null,
            paymentConfirmedByEmployeeId: null,
            status: 'pending',
            note: input.note?.trim() || null,
            idempotencyKey,
            requestFingerprint,
          }),
        );

        if (isZeroTotalPayos) {
          await this.invoices.issueForPaidOrder(manager, order.orderId);
        }

        if (
          paymentMethod === 'payos' &&
          payosAmount !== null &&
          payosAmount > 0n
        ) {
          const expiry = new Date(order.orderDate.getTime() + 15 * 60 * 1000);
          const attemptRepository = manager.getRepository(PaymentAttempt);
          await attemptRepository.save(
            attemptRepository.create({
              orderId: order.orderId,
              provider: 'payos',
              providerOrderCode: order.orderId,
              providerPaymentLinkId: null,
              checkoutUrl: null,
              amount: this.formatCents(orderTotalCents),
              status: 'creating',
              setupLeaseExpiresAt: new Date(Date.now() + PAYOS_SETUP_LEASE_MS),
              expiresAt: expiry,
              paidAt: null,
              providerReference: null,
              observedAmountPaid: null,
              reconciliationReason: null,
              reconciliationAt: null,
            }),
          );
        }

        const detailRepository = manager.getRepository(OrderDetail);
        await detailRepository.save(
          pricedLines.map((line) =>
            detailRepository.create({
              orderId: order.orderId,
              variantId: line.variantId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
            }),
          ),
        );

        return { orderId: order.orderId, created: true };
      });
    } catch (error) {
      if (
        idempotencyKey === null ||
        !this.isIdempotencyUniqueViolation(error)
      ) {
        throw error;
      }
      const existing = await this.findByIdempotencyKey(
        this.dataSource.manager,
        customerId,
        idempotencyKey,
      );
      if (!existing) throw error;
      this.assertMatchingFingerprint(existing, requestFingerprint!);
      result = { orderId: existing.orderId, created: false };
    }

    await this.payments.startOrResume(
      result.orderId,
      result.created && paymentMethod === 'payos',
    );
    return this.getOrder(customerId, String(result.orderId));
  }

  async listOrders(
    customerId: number,
    pagination: GetOrdersDto,
  ): Promise<{
    items: CustomerOrderResponse[];
    page: number;
    limit: number;
    total: number;
  }> {
    const [orders, total] = await this.dataSource
      .getRepository(SalesOrder)
      .findAndCount({
        where: { customerId },
        order: { orderDate: 'DESC', orderId: 'DESC' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

    const voucherCodes = await this.findVoucherCodes(
      this.dataSource.manager,
      orders.map((order) => order.voucherId),
    );
    const items = orders.map((order) =>
      this.withVoucherCode(
        order,
        order.voucherId === null
          ? null
          : this.requireVoucherCode(voucherCodes, order.voucherId),
      ),
    );

    return {
      items,
      page: pagination.page,
      limit: pagination.limit,
      total,
    };
  }

  async getOrder(
    customerId: number,
    orderIdInput: string,
  ): Promise<CustomerOrderResponse> {
    const orderId = this.parseOrderId(orderIdInput);
    const order = await this.dataSource
      .getRepository(SalesOrder)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.details', 'detail')
      .leftJoinAndSelect('detail.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .leftJoinAndSelect('order.paymentAttempt', 'paymentAttempt')
      .where('order.orderId = :orderId', { orderId })
      .andWhere('order.customerId = :customerId', { customerId })
      .orderBy('detail.variantId', 'ASC')
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return this.withVoucherCode(
      order,
      await this.findVoucherCode(this.dataSource.manager, order.voucherId),
    );
  }

  async cancelOrder(
    customerId: number,
    orderIdInput: string,
  ): Promise<CustomerOrderResponse> {
    const orderId = this.parseOrderId(orderIdInput);

    const existingOrder = await this.dataSource
      .getRepository(SalesOrder)
      .findOne({
        select: { orderId: true, paymentMethod: true },
        where: { orderId, customerId },
      });
    if (!existingOrder) {
      throw new NotFoundException('Order not found.');
    }

    if (existingOrder.paymentMethod === 'payos') {
      await this.payments.cancelPayosOrder(customerId, orderId);
      return this.getOrder(customerId, String(orderId));
    }

    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(SalesOrder);
      const order = await orderRepository
        .createQueryBuilder('order')
        .where('order.orderId = :orderId', { orderId })
        .andWhere('order.customerId = :customerId', { customerId })
        .setLock('pessimistic_write')
        .getOne();

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (order.status !== 'pending') {
        throw new ConflictException('Only pending orders can be cancelled.');
      }

      order.status = 'cancelled';
      await orderRepository.save(order);

      const savedOrder = await orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.details', 'detail')
        .leftJoinAndSelect('detail.variant', 'variant')
        .leftJoinAndSelect('variant.product', 'product')
        .where('order.orderId = :orderId', { orderId })
        .andWhere('order.customerId = :customerId', { customerId })
        .orderBy('detail.variantId', 'ASC')
        .getOne();

      if (!savedOrder) {
        throw new InternalServerErrorException(
          'The order could not be loaded within the transaction.',
        );
      }

      return this.withVoucherCode(
        savedOrder,
        await this.findVoucherCode(manager, savedOrder.voucherId),
      );
    });
  }

  private validateIdempotencyKey(rawKey?: string): string {
    if (
      typeof rawKey !== 'string' ||
      rawKey.length < 1 ||
      rawKey.length > 255 ||
      !/^[A-Za-z0-9._~:-]+$/.test(rawKey)
    ) {
      throw new BadRequestException(
        'PayOS order creation requires an Idempotency-Key of 1 to 255 valid characters.',
      );
    }
    return rawKey;
  }

  private createRequestFingerprint(
    input: CreateOrderDto,
    paymentMethod: 'cod' | 'payos',
  ): string {
    const canonicalRequest = {
      paymentMethod,
      recipientName: input.recipientName.trim(),
      recipientPhone: input.recipientPhone.trim(),
      shippingAddress: input.shippingAddress.trim(),
      voucherCode: input.voucherCode?.trim().toUpperCase() ?? null,
      details: input.details
        .map(({ variantId, quantity }) => ({ variantId, quantity }))
        .sort((left, right) => left.variantId - right.variantId),
    };

    return createHash('sha256')
      .update(JSON.stringify(canonicalRequest))
      .digest('hex');
  }

  private async findByIdempotencyKey(
    manager: EntityManager,
    customerId: number,
    idempotencyKey: string,
  ): Promise<SalesOrder | null> {
    return manager
      .getRepository(SalesOrder)
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.details', 'detail')
      .where('order.customerId = :customerId', { customerId })
      .andWhere('order.idempotencyKey = :idempotencyKey', { idempotencyKey })
      .orderBy('detail.variantId', 'ASC')
      .getOne();
  }

  private assertMatchingFingerprint(
    existing: SalesOrder,
    requestFingerprint: string,
  ): void {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new ConflictException(
        'This Idempotency-Key was already used for a different order request.',
      );
    }
  }

  private isIdempotencyUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const driverError = (
      error as {
        driverError?: { code?: unknown; constraint?: unknown };
      }
    ).driverError;
    return (
      driverError?.code === '23505' &&
      driverError.constraint === 'UQ_sales_order_customer_idempotency_key'
    );
  }

  private async resolveVoucher(
    manager: EntityManager,
    code: string,
    merchandiseSubtotalCents: bigint,
    idempotencyRequest?: {
      customerId: number;
      idempotencyKey: string;
      requestFingerprint: string;
    },
  ): Promise<{
    voucher: PromotionDetail;
    discountCents: bigint;
    existingOrderId?: number;
  }> {
    const voucherRepository = manager.getRepository(PromotionDetail);
    const voucherReference = await voucherRepository.findOne({
      select: { voucherId: true, promotionId: true },
      where: { code },
    });
    if (!voucherReference) {
      throw new BadRequestException('Voucher code is invalid or unavailable.');
    }

    const promotion = await manager
      .getRepository(Promotion)
      .createQueryBuilder('promotion')
      .where('promotion.promotionId = :promotionId', {
        promotionId: voucherReference.promotionId,
      })
      .setLock('pessimistic_write')
      .getOne();
    if (!promotion) {
      throw new BadRequestException('Voucher code is invalid or unavailable.');
    }

    const voucher = await voucherRepository
      .createQueryBuilder('voucher')
      .where('voucher.voucherId = :voucherId', {
        voucherId: voucherReference.voucherId,
      })
      .andWhere('voucher.promotionId = :promotionId', {
        promotionId: promotion.promotionId,
      })
      .setLock('pessimistic_write')
      .getOne();
    if (!voucher) {
      throw new BadRequestException('Voucher code is invalid or unavailable.');
    }

    if (idempotencyRequest) {
      const existing = await this.findByIdempotencyKey(
        manager,
        idempotencyRequest.customerId,
        idempotencyRequest.idempotencyKey,
      );
      if (existing) {
        this.assertMatchingFingerprint(
          existing,
          idempotencyRequest.requestFingerprint,
        );
        return {
          voucher,
          discountCents: 0n,
          existingOrderId: existing.orderId,
        };
      }
    }

    if (promotion.status !== 'active') {
      throw new BadRequestException('Voucher promotion is inactive.');
    }
    if (voucher.status !== 'active') {
      throw new BadRequestException('Voucher is inactive.');
    }

    const eligibilityRows: Array<{
      promotionDateEligible: boolean;
      voucherDateEligible: boolean;
    }> = await manager.query(
      `SELECT
        (promotion.start_date <= CURRENT_DATE AND promotion.end_date >= CURRENT_DATE) AS "promotionDateEligible",
        (voucher.start_date <= CURRENT_DATE AND voucher.end_date >= CURRENT_DATE) AS "voucherDateEligible"
      FROM "promotion" AS promotion
      INNER JOIN "promotion_detail" AS voucher
        ON voucher.promotion_id = promotion.promotion_id
      WHERE promotion.promotion_id = $1 AND voucher.voucher_id = $2`,
      [promotion.promotionId, voucher.voucherId],
    );
    const eligibility = eligibilityRows[0];
    if (!eligibility?.promotionDateEligible) {
      throw new BadRequestException(
        'Voucher promotion is not currently valid.',
      );
    }
    if (!eligibility.voucherDateEligible) {
      throw new BadRequestException('Voucher is not currently valid.');
    }

    const redemptionCount = await manager.getRepository(SalesOrder).count({
      where: {
        voucherId: voucher.voucherId,
        status: In(['pending', 'packed']),
      },
    });
    if (redemptionCount >= voucher.quantity) {
      throw new BadRequestException(
        'Voucher has reached its redemption limit.',
      );
    }

    const minimumPriceCents = this.parseStoredMoneyCents(
      voucher.minPrice,
      'minimum price',
    );
    if (merchandiseSubtotalCents < minimumPriceCents) {
      throw new BadRequestException(
        `Order subtotal must be at least ${this.formatCents(minimumPriceCents)} to use this voucher.`,
      );
    }

    const discountValueCents = this.parseStoredMoneyCents(
      voucher.discountValue,
      'discount value',
    );
    let discountCents =
      voucher.type === 'fixed'
        ? discountValueCents
        : (merchandiseSubtotalCents * discountValueCents + 5_000n) / 10_000n;

    if (voucher.maxDiscount !== null) {
      const maximumDiscountCents = this.parseStoredMoneyCents(
        voucher.maxDiscount,
        'maximum discount',
      );
      if (discountCents > maximumDiscountCents) {
        discountCents = maximumDiscountCents;
      }
    }
    if (discountCents > merchandiseSubtotalCents) {
      discountCents = merchandiseSubtotalCents;
    }

    return { voucher, discountCents };
  }

  private parseStoredMoneyCents(value: string, fieldName: string): bigint {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) {
      throw new InternalServerErrorException(
        `Voucher ${fieldName} is not a valid amount.`,
      );
    }

    const wholePart = match[1].replace(/^0+/, '') || '0';
    if (wholePart.length > 22) {
      throw new InternalServerErrorException(
        `Voucher ${fieldName} exceeds the supported database precision.`,
      );
    }

    return (
      BigInt(wholePart) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
    );
  }

  private async findVoucherCode(
    manager: EntityManager,
    voucherId: number | null,
  ): Promise<string | null> {
    if (voucherId === null) return null;
    const voucher = await manager.getRepository(PromotionDetail).findOne({
      select: { voucherId: true, code: true },
      where: { voucherId },
    });
    if (!voucher) {
      throw new InternalServerErrorException(
        'The order references a voucher that could not be loaded.',
      );
    }
    return voucher.code;
  }

  private async findVoucherCodes(
    manager: EntityManager,
    voucherIds: Array<number | null>,
  ): Promise<Map<number, string>> {
    const uniqueVoucherIds = [
      ...new Set(
        voucherIds.filter(
          (voucherId): voucherId is number => voucherId !== null,
        ),
      ),
    ];
    if (uniqueVoucherIds.length === 0) return new Map();

    const vouchers = await manager.getRepository(PromotionDetail).find({
      select: { voucherId: true, code: true },
      where: { voucherId: In(uniqueVoucherIds) },
    });
    return new Map(
      vouchers.map((voucher) => [voucher.voucherId, voucher.code]),
    );
  }

  private requireVoucherCode(
    voucherCodes: Map<number, string>,
    voucherId: number,
  ): string {
    const code = voucherCodes.get(voucherId);
    if (!code) {
      throw new InternalServerErrorException(
        'The order references a voucher that could not be loaded.',
      );
    }
    return code;
  }

  private withVoucherCode(
    order: SalesOrder,
    voucherCode: string | null,
  ): CustomerOrderResponse {
    const attempt = order.paymentAttempt;
    const customerOrder = Object.fromEntries(
      Object.entries(order).filter(
        ([key]) =>
          key !== 'paymentAttempt' &&
          key !== 'idempotencyKey' &&
          key !== 'requestFingerprint' &&
          key !== 'details',
      ),
    ) as Omit<
      SalesOrder,
      'paymentAttempt' | 'idempotencyKey' | 'requestFingerprint' | 'details'
    >;
    const response: CustomerOrderResponse = {
      ...customerOrder,
      paymentMethod: order.paymentMethod ?? 'cod',
      voucherCode,
    };

    if (order.details !== undefined) {
      response.details = order.details.map((detail) => ({
        orderId: detail.orderId,
        variantId: detail.variantId,
        quantity: detail.quantity,
        unitPrice: detail.unitPrice,
        subtotal: detail.subtotal,
        productName: detail.variant.product.name,
        size: detail.variant.size,
        color: detail.variant.color,
      }));
    }

    if (
      order.paymentMethod === 'payos' &&
      order.paymentStatus === 'unpaid' &&
      order.status === 'pending' &&
      attempt?.status === 'pending' &&
      attempt.checkoutUrl
    ) {
      response.checkoutUrl = attempt.checkoutUrl;
      response.paymentExpiresAt = attempt.expiresAt;
    }

    return response;
  }

  private parseOrderId(orderIdInput: string): number {
    if (!/^\d+$/.test(orderIdInput)) {
      throw new NotFoundException('Order not found.');
    }

    const orderId = Number(orderIdInput);
    if (
      !Number.isSafeInteger(orderId) ||
      orderId < 1 ||
      orderId > 2_147_483_647
    ) {
      throw new NotFoundException('Order not found.');
    }

    return orderId;
  }

  private parseUnitPrice(price: string, variantId: number): bigint {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price);
    if (!match) {
      throw new BadRequestException(
        `Price for product variant ${variantId} is not a valid amount with at most two decimal places.`,
      );
    }

    const whole = BigInt(match[1]);
    const fractional = BigInt((match[2] ?? '').padEnd(2, '0') || '0');
    const cents = whole * 100n + fractional;

    this.assertFitsNumeric(
      cents,
      UNIT_PRICE_PRECISION,
      `Price for product variant ${variantId}`,
    );

    return cents;
  }

  private assertFitsNumeric(
    cents: bigint,
    precision: number,
    fieldName: string,
  ): void {
    const maximumCents = 10n ** BigInt(precision) - 1n;
    if (cents < 0n || cents > maximumCents) {
      throw new BadRequestException(
        `${fieldName} exceeds the supported database precision.`,
      );
    }
  }

  private formatCents(cents: bigint): string {
    const whole = cents / 100n;
    const fractional = (cents % 100n).toString().padStart(2, '0');
    return `${whole}.${fractional}`;
  }
}
