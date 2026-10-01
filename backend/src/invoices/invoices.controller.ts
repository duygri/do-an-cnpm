import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import type { CustomerAuthenticatedRequest } from '../customers/customer-authenticated-request';
import { CustomerJwtGuard } from '../customers/customer-jwt.guard';
import { InvoicesService } from './invoices.service';

@Controller('orders/:orderId/invoice')
@UseGuards(CustomerJwtGuard)
export class CustomerInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  get(
    @Param('orderId') orderId: string,
    @Req() request: CustomerAuthenticatedRequest,
  ) {
    return this.invoices.getCustomerInvoice(
      orderId,
      request.customer.customerId,
    );
  }
}

@Controller('admin/orders/:orderId/invoice')
@UseGuards(EmployeeJwtGuard)
export class AdminInvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  get(@Param('orderId') orderId: string) {
    return this.invoices.getAdminInvoice(orderId);
  }
}
