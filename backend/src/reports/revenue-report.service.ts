import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { GetRevenueReportDto } from './dto/get-revenue-report.dto';

interface RevenueRow {
  date: string;
  orderCount: number | string;
  amount: string;
}

export interface DailyRevenue {
  date: string;
  orderCount: number;
  amount: string;
}

@Injectable()
export class RevenueReportService {
  private static readonly timezone = 'Asia/Ho_Chi_Minh';

  constructor(
    @InjectRepository(SalesOrder)
    private readonly orders: Repository<SalesOrder>,
  ) {}

  async getRevenueReport(input: GetRevenueReportDto): Promise<{
    from: string;
    to: string;
    timezone: string;
    paidOrderCount: number;
    collectedAmount: string;
    daily: DailyRevenue[];
  }> {
    const from = this.parseDate(input.from, 'from');
    const to = this.parseDate(input.to, 'to');
    const rangeDays = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;

    if (rangeDays < 1) {
      throw new BadRequestException('to must be on or after from.');
    }

    if (rangeDays > 366) {
      throw new BadRequestException('Date range may not exceed 366 calendar days.');
    }

    const rows = await this.orders.query<RevenueRow[]>(
      `SELECT
         ("payment_confirmed_at" AT TIME ZONE $3)::date::text AS "date",
         COUNT(*)::integer AS "orderCount",
         SUM("total_amount")::text AS "amount"
       FROM "sales_order"
       WHERE "payment_status" = 'paid'
         AND "status" <> 'cancelled'
         AND "payment_confirmed_at" >= (($1::date)::timestamp AT TIME ZONE $3)
         AND "payment_confirmed_at" < ((($2::date + INTERVAL '1 day')::timestamp) AT TIME ZONE $3)
       GROUP BY ("payment_confirmed_at" AT TIME ZONE $3)::date
       ORDER BY ("payment_confirmed_at" AT TIME ZONE $3)::date ASC`,
      [input.from, input.to, RevenueReportService.timezone],
    );

    const dailyByDate = new Map(
      rows.map((row) => [
        row.date,
        {
          orderCount: this.toInteger(row.orderCount),
          amount: this.toFixedMoney(row.amount),
        },
      ]),
    );
    const daily: DailyRevenue[] = [];
    let paidOrderCount = 0;
    let collectedAmount = 0n;

    for (let cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = this.formatDate(cursor);
      const value = dailyByDate.get(date) ?? { orderCount: 0, amount: '0.00' };
      daily.push({ date, ...value });
      paidOrderCount += value.orderCount;
      collectedAmount += this.moneyToCents(value.amount);
    }

    return {
      from: input.from,
      to: input.to,
      timezone: RevenueReportService.timezone,
      paidOrderCount,
      collectedAmount: this.centsToMoney(collectedAmount),
      daily,
    };
  }

  private parseDate(value: string, field: 'from' | 'to'): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException(`${field} must be a valid ISO calendar date.`);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException(`${field} must be a valid calendar date.`);
    }
    return date;
  }

  private formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toInteger(value: number | string): number {
    const integer = Number(value);
    if (!Number.isSafeInteger(integer) || integer < 0) {
      throw new Error('Revenue query returned an invalid order count.');
    }
    return integer;
  }

  private toFixedMoney(value: string): string {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
    if (!match) {
      throw new Error('Revenue query returned an invalid monetary amount.');
    }
    return `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}`;
  }

  private moneyToCents(value: string): bigint {
    const [whole, fractional] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fractional);
  }

  private centsToMoney(value: bigint): string {
    return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
  }
}
