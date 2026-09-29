import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SalesOrder, PaymentAttempt])],
})
export class PayosPaymentModule {}
