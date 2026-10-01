import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { Invoice } from './entities/invoice.entity';
import {
  AdminInvoicesController,
  CustomerInvoicesController,
} from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    AuthModule,
    CustomersModule,
    TypeOrmModule.forFeature([Invoice, SalesOrder]),
  ],
  controllers: [CustomerInvoicesController, AdminInvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
