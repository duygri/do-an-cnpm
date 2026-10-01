import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { Invoice } from './entities/invoice.entity';

export interface InvoiceSummary {
  invoiceId: number;
  orderId: number;
  issuedDate: string;
  totalAmount: string;
  status: string;
}

@Injectable()
export class InvoicesService {
  constructor(private readonly dataSource: DataSource) {}

  async issueForPaidOrder(
    manager: EntityManager,
    orderId: number,
  ): Promise<Invoice> {
    const order = await manager.getRepository(SalesOrder).findOne({
      where: { orderId },
      select: { orderId: true, paymentStatus: true, totalAmount: true },
    });
    if (!order) {
      throw new InternalServerErrorException(
        'Cannot issue an invoice for a missing order.',
      );
    }
    if (order.paymentStatus !== 'paid') {
      throw new ConflictException(
        'An invoice can only be issued for a paid order.',
      );
    }

    const invoices = manager.getRepository(Invoice);
    await invoices
      .createQueryBuilder()
      .insert()
      .into(Invoice)
      .values({
        orderId,
        issuedDate: () => 'CURRENT_TIMESTAMP',
        totalAmount: order.totalAmount,
        status: 'issued',
      })
      .orIgnore()
      .execute();

    const invoice = await invoices.findOneBy({ orderId });
    if (!invoice) {
      throw new InternalServerErrorException(
        'The paid order invoice could not be loaded after issuance.',
      );
    }
    return invoice;
  }

  async getCustomerInvoice(
    orderIdInput: string,
    customerId: number,
  ): Promise<InvoiceSummary> {
    const orderId = this.parseOrderId(orderIdInput);
    const invoice = await this.dataSource
      .getRepository(Invoice)
      .createQueryBuilder('invoice')
      .innerJoin('invoice.order', 'order')
      .where('invoice.orderId = :orderId', { orderId })
      .andWhere('order.customerId = :customerId', { customerId })
      .getOne();

    if (!invoice) throw new NotFoundException('Invoice not found.');
    return this.toSummary(invoice);
  }

  async getAdminInvoice(orderIdInput: string): Promise<InvoiceSummary> {
    const orderId = this.parseOrderId(orderIdInput);
    const invoice = await this.dataSource
      .getRepository(Invoice)
      .findOneBy({ orderId });

    if (!invoice) throw new NotFoundException('Invoice not found.');
    return this.toSummary(invoice);
  }

  private parseOrderId(input: string): number {
    if (!/^[1-9]\d*$/.test(input)) {
      throw new NotFoundException('Invoice not found.');
    }
    const orderId = Number(input);
    if (!Number.isSafeInteger(orderId)) {
      throw new NotFoundException('Invoice not found.');
    }
    return orderId;
  }

  private toSummary(invoice: Invoice): InvoiceSummary {
    return {
      invoiceId: invoice.invoiceId,
      orderId: invoice.orderId,
      issuedDate: new Date(invoice.issuedDate).toISOString(),
      totalAmount: invoice.totalAmount,
      status: invoice.status,
    };
  }
}
