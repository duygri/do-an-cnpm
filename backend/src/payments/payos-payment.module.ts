import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PayosWebhookController } from './payos-webhook.controller';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PayosPaymentProvider } from './payos-payment.provider';
import { PaymentsService } from './payments.service';
import { PaymentExpiryScheduler } from './payment-expiry.scheduler';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [
    ConfigModule,
    InvoicesModule,
    TypeOrmModule.forFeature([SalesOrder, PaymentAttempt]),
  ],
  controllers: [PayosWebhookController],
  providers: [
    PayosPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: PayosPaymentProvider },
    PaymentsService,
    PaymentExpiryScheduler,
  ],
  exports: [PAYMENT_PROVIDER, PayosPaymentProvider, PaymentsService],
})
export class PayosPaymentModule {}
