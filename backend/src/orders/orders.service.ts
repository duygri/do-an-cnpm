import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { Promotion } from '../promotions/entities/promotion.entity';
import { PromotionDetail } from '../promotions/entities/promotion-detail.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderDetail } from './entities/order-detail.entity';
import { SalesOrder } from './entities/sales-order.entity';
import { GetOrdersDto } from './dto/get-orders.dto';

const UNIT_PRICE_PRECISION = 12;
const SUBTOTAL_PRECISION = 22;
const TOTAL_PRECISION = 24;

interface PricedOrderLine {
  variantId: number;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

type CustomerOrderResponse = SalesOrder & { voucherCode: string | null };

@Injectable()
export class OrdersService {
  constructor(private readonly dataSource: DataSource) {}

  async createOrder(
    input: CreateOrderDto,
    customerId: number,
  ): Promise<CustomerOrderResponse> {
    const sortedDetails = [...input.details].sort(
      (left, right) => left.variantId - right.variantId,
    );
    const variantIds = sortedDetails.map((detail) => detail.variantId);

    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'A variant may appear only once per order.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
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
        );
        voucherId = voucherResult.voucher.voucherId;
        discountCents = voucherResult.discountCents;
      }

      const shippingFeeCents = 0n;
      const orderTotalCents = totalCents - discountCents + shippingFeeCents;

      this.assertFitsNumeric(orderTotalCents, TOTAL_PRECISION, 'Order total');

      const orderRepository = manager.getRepository(SalesOrder);
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
          paymentMethod: 'cod',
          paymentStatus: 'unpaid',
          status: 'pending',
          note: input.note?.trim() || null,
        }),
      );

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

      const savedOrder = await manager
        .getRepository(SalesOrder)
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.details', 'detail')
        .where('order.orderId = :orderId', { orderId: order.orderId })
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

  private async resolveVoucher(
    manager: EntityManager,
    code: string,
    merchandiseSubtotalCents: bigint,
  ): Promise<{ voucher: PromotionDetail; discountCents: bigint }> {
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
    return Object.assign(order, { voucherCode });
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
