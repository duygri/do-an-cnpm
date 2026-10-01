import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { PromotionDetail } from '../promotions/entities/promotion-detail.entity';
import { OrderDetail } from './entities/order-detail.entity';
import { SalesOrder } from './entities/sales-order.entity';
import { GetAdminOrdersDto } from './dto/get-admin-orders.dto';
import { PackOrderDto } from './dto/pack-order.dto';
import { Packing } from './entities/packing.entity';
import { InvoicesService } from '../invoices/invoices.service';

interface AdminOrderDetailRow {
  orderId: number;
  orderDate: Date | string;
  customerId: number;
  voucherId: number | null;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  discountAmount: string;
  shippingFee: string;
  totalAmount: string;
  paymentMethod: string | null;
  paymentStatus: string;
  status: string;
  note: string | null;
  detailOrderId: number | null;
  detailVariantId: number | null;
  detailQuantity: number | null;
  detailUnitPrice: string | null;
  detailSubtotal: string | null;
  productName: string | null;
  size: string | null;
  color: string | null;
  packingId: number | null;
  packingDate: Date | string | null;
  packingType: 'bag' | 'box' | null;
  packingStatus: 'packed' | null;
  packingNote: string | null;
  packingEmployeeId: number | null;
  paymentConfirmedAt: Date | string | null;
  paymentConfirmedByEmployeeId: number | null;
  paymentAttemptStatus: string | null;
  paymentProviderReference: string | null;
  paymentObservedAmountPaid: string | null;
  paymentReconciliationReason: string | null;
  paymentReconciliationAt: Date | string | null;
  paymentProviderLinkWithoutCheckoutUrl: boolean;
}

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly invoices: InvoicesService,
  ) {}

  async listOrders(pagination: GetAdminOrdersDto): Promise<{
    items: Array<{
      orderId: number;
      orderDate: string;
      customerId: number;
      recipientName: string;
      status: string;
      paymentStatus: string;
      voucherCode: string | null;
      discountAmount: string;
      totalAmount: string;
      detailCount: number;
    }>;
    page: number;
    limit: number;
    total: number;
  }> {
    const orderRepository = this.dataSource.getRepository(SalesOrder);
    const [orders, total] = await orderRepository.findAndCount({
      where: pagination.status ? { status: pagination.status } : {},
      select: {
        orderId: true,
        orderDate: true,
        customerId: true,
        voucherId: true,
        recipientName: true,
        status: true,
        paymentStatus: true,
        discountAmount: true,
        totalAmount: true,
      },
      order: { orderDate: 'DESC', orderId: 'DESC' },
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
    });

    const voucherCodes = await this.findVoucherCodes(
      orders.map((order) => order.voucherId),
    );

    const detailCounts = new Map<number, number>();
    if (orders.length > 0) {
      const orderIds = orders.map(({ orderId }) => orderId);
      const countRows = await this.dataSource
        .getRepository(OrderDetail)
        .createQueryBuilder('detail')
        .select('detail.orderId', 'orderId')
        .addSelect('COUNT(detail.variantId)::integer', 'detailCount')
        .where('detail.orderId IN (:...orderIds)', { orderIds })
        .groupBy('detail.orderId')
        .getRawMany<{ orderId: number; detailCount: number }>();

      for (const row of countRows) {
        detailCounts.set(
          this.toInteger(Number(row.orderId)),
          this.toInteger(Number(row.detailCount)),
        );
      }
    }

    return {
      items: orders.map((order) => ({
        orderId: this.toInteger(order.orderId),
        orderDate: this.toIsoUtc(order.orderDate),
        customerId: this.toInteger(order.customerId),
        voucherCode:
          order.voucherId === null
            ? null
            : this.requireVoucherCode(voucherCodes, order.voucherId),
        recipientName: order.recipientName,
        status: order.status,
        paymentStatus: order.paymentStatus,
        discountAmount: this.toFixedMoney(order.discountAmount),
        totalAmount: this.toFixedMoney(order.totalAmount),
        detailCount: detailCounts.get(order.orderId) ?? 0,
      })),
      page: this.toInteger(pagination.page),
      limit: this.toInteger(pagination.limit),
      total: this.toInteger(total),
    };
  }

  async getOrder(orderIdInput: string) {
    const orderId = this.parseOrderId(orderIdInput);
    return this.loadOrder(this.dataSource.manager, orderId);
  }

  async packOrder(
    orderIdInput: string,
    input: PackOrderDto,
    employeeId: number,
  ) {
    const orderId = this.parseOrderId(orderIdInput);

    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(SalesOrder);
      const order = await orderRepository
        .createQueryBuilder('order')
        .where('order.orderId = :orderId', { orderId })
        .setLock('pessimistic_write')
        .getOne();

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (order.status !== 'pending') {
        throw new ConflictException('Only pending orders can be packed.');
      }

      if (order.paymentMethod === 'payos' && order.paymentStatus !== 'paid') {
        throw new ConflictException(
          'PayOS orders must be paid before they can be packed.',
        );
      }

      await manager
        .getRepository(Packing)
        .createQueryBuilder()
        .insert()
        .into(Packing)
        .values({
          orderId,
          employeeId,
          packingType: input.packingType ?? null,
          status: 'packed',
          note: input.note ?? null,
          packingDate: () => 'CURRENT_TIMESTAMP',
        })
        .execute();

      order.status = 'packed';
      await orderRepository.save(order);

      return this.loadOrder(manager, orderId);
    });
  }

  async markPaid(orderIdInput: string, employeeId: number) {
    const orderId = this.parseOrderId(orderIdInput);

    return this.dataSource.transaction(async (manager) => {
      const orderRepository = manager.getRepository(SalesOrder);
      const order = await orderRepository
        .createQueryBuilder('order')
        .where('order.orderId = :orderId', { orderId })
        .setLock('pessimistic_write')
        .getOne();

      if (!order) {
        throw new NotFoundException('Order not found.');
      }

      if (order.paymentMethod === 'payos') {
        throw new ConflictException(
          'PayOS orders can only be marked as paid by provider reconciliation.',
        );
      }

      if (order.status !== 'packed') {
        throw new ConflictException(
          'Only packed orders can be marked as paid.',
        );
      }

      if (order.paymentMethod !== 'cod' && order.paymentMethod !== null) {
        throw new ConflictException('Only COD orders can be marked as paid.');
      }

      if (order.paymentStatus !== 'unpaid') {
        throw new ConflictException(
          'Only unpaid orders can be marked as paid.',
        );
      }

      await orderRepository
        .createQueryBuilder()
        .update(SalesOrder)
        .set({
          paymentStatus: 'paid',
          paymentConfirmedAt: () => 'CURRENT_TIMESTAMP',
          paymentConfirmedByEmployeeId: employeeId,
        })
        .where('orderId = :orderId', { orderId })
        .execute();

      await this.invoices.issueForPaidOrder(manager, orderId);

      return this.loadOrder(manager, orderId);
    });
  }

  private async loadOrder(manager: EntityManager, orderId: number) {
    const rows = await manager
      .getRepository(SalesOrder)
      .createQueryBuilder('order')
      .leftJoin('order.details', 'detail')
      .leftJoin('detail.variant', 'variant')
      .leftJoin('variant.product', 'product')
      .leftJoin('order.packing', 'packing')
      .leftJoin('order.paymentAttempt', 'paymentAttempt')
      .select('order.orderId', 'orderId')
      .addSelect('order.orderDate', 'orderDate')
      .addSelect('order.customerId', 'customerId')
      .addSelect('order.voucherId', 'voucherId')
      .addSelect('order.recipientName', 'recipientName')
      .addSelect('order.recipientPhone', 'recipientPhone')
      .addSelect('order.shippingAddress', 'shippingAddress')
      .addSelect('order.discountAmount', 'discountAmount')
      .addSelect('order.shippingFee', 'shippingFee')
      .addSelect('order.totalAmount', 'totalAmount')
      .addSelect('order.paymentMethod', 'paymentMethod')
      .addSelect('order.paymentStatus', 'paymentStatus')
      .addSelect('order.paymentConfirmedAt', 'paymentConfirmedAt')
      .addSelect(
        'order.paymentConfirmedByEmployeeId',
        'paymentConfirmedByEmployeeId',
      )
      .addSelect('order.status', 'status')
      .addSelect('order.note', 'note')
      .addSelect('detail.orderId', 'detailOrderId')
      .addSelect('detail.variantId', 'detailVariantId')
      .addSelect('detail.quantity', 'detailQuantity')
      .addSelect('detail.unitPrice', 'detailUnitPrice')
      .addSelect('detail.subtotal', 'detailSubtotal')
      .addSelect('product.name', 'productName')
      .addSelect('variant.size', 'size')
      .addSelect('variant.color', 'color')
      .addSelect('packing.packingId', 'packingId')
      .addSelect('packing.packingDate', 'packingDate')
      .addSelect('packing.packingType', 'packingType')
      .addSelect('packing.status', 'packingStatus')
      .addSelect('packing.note', 'packingNote')
      .addSelect('packing.employeeId', 'packingEmployeeId')
      .addSelect('paymentAttempt.status', 'paymentAttemptStatus')
      .addSelect('paymentAttempt.providerReference', 'paymentProviderReference')
      .addSelect(
        'paymentAttempt.observedAmountPaid',
        'paymentObservedAmountPaid',
      )
      .addSelect(
        'paymentAttempt.reconciliationReason',
        'paymentReconciliationReason',
      )
      .addSelect('paymentAttempt.reconciliationAt', 'paymentReconciliationAt')
      .addSelect(
        'CASE WHEN paymentAttempt.providerPaymentLinkId IS NOT NULL AND paymentAttempt.checkoutUrl IS NULL THEN TRUE ELSE FALSE END',
        'paymentProviderLinkWithoutCheckoutUrl',
      )
      .where('order.orderId = :orderId', { orderId })
      .orderBy('detail.variantId', 'ASC')
      .getRawMany<AdminOrderDetailRow>();

    const order = rows[0];
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const details = rows
      .filter((row) => row.detailVariantId !== null)
      .map((row) => ({
        orderId: this.toInteger(row.detailOrderId),
        variantId: this.toInteger(row.detailVariantId),
        productName: row.productName!,
        size: row.size,
        color: row.color,
        quantity: this.toInteger(row.detailQuantity),
        unitPrice: this.toFixedMoney(row.detailUnitPrice!),
        subtotal: this.toFixedMoney(row.detailSubtotal!),
      }));

    const voucherCode =
      order.voucherId === null
        ? null
        : await this.findVoucherCode(this.toInteger(order.voucherId));

    const packing =
      order.packingId === null
        ? null
        : {
            packingId: this.toInteger(order.packingId),
            packingDate: this.toIsoUtc(order.packingDate!),
            packingType: order.packingType,
            status: order.packingStatus!,
            note: order.packingNote,
            employeeId: this.toInteger(order.packingEmployeeId),
          };

    return {
      orderId: this.toInteger(order.orderId),
      orderDate: this.toIsoUtc(order.orderDate),
      customerId: this.toInteger(order.customerId),
      voucherCode,
      recipientName: order.recipientName,
      recipientPhone: order.recipientPhone,
      shippingAddress: order.shippingAddress,
      discountAmount: this.toFixedMoney(order.discountAmount),
      shippingFee: this.toFixedMoney(order.shippingFee),
      totalAmount: this.toFixedMoney(order.totalAmount),
      paymentMethod: order.paymentMethod ?? 'cod',
      paymentStatus: order.paymentStatus,
      paymentAttentionRequired:
        order.paymentAttemptStatus === 'reconciliation_required' ||
        order.paymentProviderLinkWithoutCheckoutUrl ||
        order.paymentReconciliationReason !== null,
      paymentAttempt:
        order.paymentAttemptStatus === null
          ? null
          : {
              status: order.paymentAttemptStatus,
              providerReference: order.paymentProviderReference,
              observedAmountPaid:
                order.paymentObservedAmountPaid === null
                  ? null
                  : this.toFixedMoney(order.paymentObservedAmountPaid),
              reconciliationReason: order.paymentReconciliationReason,
              reconciliationAt:
                order.paymentReconciliationAt === null
                  ? null
                  : this.toIsoUtc(order.paymentReconciliationAt),
              checkoutUrlMissing: order.paymentProviderLinkWithoutCheckoutUrl,
            },
      paymentConfirmedAt:
        order.paymentConfirmedAt === null
          ? null
          : this.toIsoUtc(order.paymentConfirmedAt),
      paymentConfirmedByEmployeeId:
        order.paymentConfirmedByEmployeeId === null
          ? null
          : this.toInteger(order.paymentConfirmedByEmployeeId),
      status: order.status,
      note: order.note,
      details,
      packing,
    };
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

  private async findVoucherCodes(
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

    const vouchers = await this.dataSource.getRepository(PromotionDetail).find({
      select: { voucherId: true, code: true },
      where: { voucherId: In(uniqueVoucherIds) },
    });
    return new Map(
      vouchers.map((voucher) => [voucher.voucherId, voucher.code]),
    );
  }

  private async findVoucherCode(voucherId: number): Promise<string> {
    const voucher = await this.dataSource
      .getRepository(PromotionDetail)
      .findOne({
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

  private toInteger(value: number | null): number {
    if (value === null || !Number.isSafeInteger(value)) {
      throw new InternalServerErrorException(
        'The order response contains an invalid integer.',
      );
    }
    return value;
  }

  private toFixedMoney(value: string): string {
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match || (match[3]?.length ?? 0) > 2) {
      throw new InternalServerErrorException(
        'The order response contains an invalid monetary value.',
      );
    }

    return `${match[1]}${match[2]}.${(match[3] ?? '').padEnd(2, '0')}`;
  }

  private toIsoUtc(value: Date | string): string {
    const timestamp = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
      throw new InternalServerErrorException(
        'The order response contains an invalid timestamp.',
      );
    }
    return timestamp.toISOString();
  }
}
