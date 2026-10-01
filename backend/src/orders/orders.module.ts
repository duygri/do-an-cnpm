import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { Product } from '../catalog/entities/product.entity';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { OrderDetail } from './entities/order-detail.entity';
import { Packing } from './entities/packing.entity';
import { SalesOrder } from './entities/sales-order.entity';
import { PromotionDetail } from '../promotions/entities/promotion-detail.entity';
import { Promotion } from '../promotions/entities/promotion.entity';
import { PaymentAttempt } from '../payments/entities/payment-attempt.entity';
import { PayosPaymentModule } from '../payments/payos-payment.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    PayosPaymentModule,
    InvoicesModule,
    TypeOrmModule.forFeature([
      SalesOrder,
      OrderDetail,
      Packing,
      ProductVariant,
      Product,
      Promotion,
      PromotionDetail,
      PaymentAttempt,
    ]),
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService],
})
export class OrdersModule {}
