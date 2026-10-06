import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import { EmployeeRoles } from '../auth/employee-roles.decorator';
import { EmployeeRolesGuard } from '../auth/employee-roles.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { GetAdminOrdersDto } from './dto/get-admin-orders.dto';
import { PackOrderDto } from './dto/pack-order.dto';
import { AdminOrdersService } from './admin-orders.service';

@Controller('admin/orders')
@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)
@EmployeeRoles('manager')
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

  @Post(':orderId/pack')
  @HttpCode(HttpStatus.OK)
  pack(
    @Param('orderId') orderId: string,
    @Body() input: PackOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.orders.packOrder(orderId, input, request.employee.employeeId);
  }

  @Post(':orderId/mark-paid')
  @HttpCode(HttpStatus.OK)
  markPaid(
    @Param('orderId') orderId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.orders.markPaid(orderId, request.employee.employeeId);
  }
}
