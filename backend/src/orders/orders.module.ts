import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { Product } from '../catalog/entities/product.entity';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { OrderDetail } from './entities/order-detail.entity';
import { Packing } from './entities/packing.entity';
import { SalesOrder } from './entities/sales-order.entity';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    InventoryModule,
    TypeOrmModule.forFeature([
      SalesOrder,
      OrderDetail,
      Packing,
      InventoryMovement,
      ProductVariant,
      Product,
    ]),
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, AdminOrdersService],
})
export class OrdersModule {}
