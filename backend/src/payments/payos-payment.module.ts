import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PayosPaymentProvider } from './payos-payment.provider';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SalesOrder, PaymentAttempt]),
  ],
  providers: [
    PayosPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: PayosPaymentProvider },
  ],
  exports: [PAYMENT_PROVIDER, PayosPaymentProvider],
})
export class PayosPaymentModule {}
