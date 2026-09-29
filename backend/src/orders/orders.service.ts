import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
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

@Injectable()
export class OrdersService {
  constructor(private readonly dataSource: DataSource) {}

  async createOrder(
    input: CreateOrderDto,
    customerId: number,
  ): Promise<SalesOrder> {
    const sortedDetails = [...input.details].sort(
      (left, right) => left.variantId - right.variantId,
    );
    const variantIds = sortedDetails.map((detail) => detail.variantId);

    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'A variant may appear only once per order.',
      );
    }

    return this.dataSource.transaction(async (manager): Promise<SalesOrder> => {
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

      this.assertFitsNumeric(totalCents, TOTAL_PRECISION, 'Order total');

      const orderRepository = manager.getRepository(SalesOrder);
      const order = await orderRepository.save(
        orderRepository.create({
          customerId,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          shippingAddress: input.shippingAddress,
          discountAmount: '0.00',
          shippingFee: '0.00',
          totalAmount: this.formatCents(totalCents),
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

      return savedOrder;
    });
  }

  async listOrders(
    customerId: number,
    pagination: GetOrdersDto,
  ): Promise<{
    items: SalesOrder[];
    page: number;
    limit: number;
    total: number;
  }> {
    const [items, total] = await this.dataSource
      .getRepository(SalesOrder)
      .findAndCount({
        where: { customerId },
        order: { orderDate: 'DESC', orderId: 'DESC' },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
      });

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
  ): Promise<SalesOrder> {
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

    return order;
  }

  async cancelOrder(
    customerId: number,
    orderIdInput: string,
  ): Promise<SalesOrder> {
    const orderId = this.parseOrderId(orderIdInput);

    return this.dataSource.transaction(async (manager): Promise<SalesOrder> => {
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

      return savedOrder;
    });
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
