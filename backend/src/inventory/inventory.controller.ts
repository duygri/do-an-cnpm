import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { CreateOpeningBalancesDto } from './dto/create-opening-balances.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { GetStockBalanceDto } from './dto/get-stock-balance.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(EmployeeJwtGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('opening-balances')
  createOpeningBalances(
    @Body() input: CreateOpeningBalancesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.createOpeningBalances(input, request.employee);
  }

  @Post('adjustments')
  createAdjustment(
    @Body() input: CreateStockAdjustmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventory.createAdjustment(input, request.employee);
  }

  @Get('variants/:variantId/balance')
  getBalance(
    @Param('variantId', ParseIntPipe) variantId: number,
    @Query() period: GetStockBalanceDto,
  ) {
    return this.inventory.getPeriodBalance(variantId, period);
  }
}
