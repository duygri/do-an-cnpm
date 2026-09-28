import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomersModule } from '../customers/customers.module';
import { Product } from '../catalog/entities/product.entity';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { InventoryModule } from '../inventory/inventory.module';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { OrderDetail } from './entities/order-detail.entity';
import { SalesOrder } from './entities/sales-order.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    CustomersModule,
    InventoryModule,
    TypeOrmModule.forFeature([
      SalesOrder,
      OrderDetail,
      InventoryMovement,
      ProductVariant,
      Product,
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
