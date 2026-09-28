import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import { GetAdminOrdersDto } from './dto/get-admin-orders.dto';
import { AdminOrdersService } from './admin-orders.service';

@Controller('admin/orders')
@UseGuards(EmployeeJwtGuard)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(@Query() query: GetAdminOrdersDto) {
    return this.orders.listOrders(query);
  }

  @Get(':orderId')
  get(@Param('orderId') orderId: string) {
    return this.orders.getOrder(orderId);
  }
}
