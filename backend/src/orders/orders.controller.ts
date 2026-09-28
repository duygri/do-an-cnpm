import {
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
import type { CustomerAuthenticatedRequest } from '../customers/customer-authenticated-request';
import { CustomerJwtGuard } from '../customers/customer-jwt.guard';
import { GetOrdersDto } from './dto/get-orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(CustomerJwtGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Req() request: CustomerAuthenticatedRequest,
    @Query() query: GetOrdersDto,
  ) {
    return this.orders.listOrders(request.customer.customerId, query);
  }

  @Get(':orderId')
  get(
    @Req() request: CustomerAuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.orders.getOrder(request.customer.customerId, orderId);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Req() request: CustomerAuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.orders.cancelOrder(request.customer.customerId, orderId);
  }
}
