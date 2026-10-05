import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import { EmployeeRoles } from '../auth/employee-roles.decorator';
import { EmployeeRolesGuard } from '../auth/employee-roles.guard';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)
@EmployeeRoles('promotion_manager')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  findAll() {
    return this.promotions.findAll();
  }

  @Get(':promotionId')
  findOne(@Param('promotionId', ParseIntPipe) promotionId: number) {
    return this.promotions.findOne(promotionId);
  }

  @Post()
  create(@Body() input: CreatePromotionDto) {
    return this.promotions.create(input);
  }

  @Patch(':promotionId')
  update(
    @Param('promotionId', ParseIntPipe) promotionId: number,
    @Body() input: UpdatePromotionDto,
  ) {
    return this.promotions.update(promotionId, input);
  }

  @Get(':promotionId/vouchers')
  findVouchers(@Param('promotionId', ParseIntPipe) promotionId: number) {
    return this.promotions.findVouchers(promotionId);
  }

  @Post(':promotionId/vouchers')
  createVoucher(
    @Param('promotionId', ParseIntPipe) promotionId: number,
    @Body() input: CreateVoucherDto,
  ) {
    return this.promotions.createVoucher(promotionId, input);
  }

  @Get(':promotionId/vouchers/:voucherId')
  findVoucher(
    @Param('promotionId', ParseIntPipe) promotionId: number,
    @Param('voucherId', ParseIntPipe) voucherId: number,
  ) {
    return this.promotions.findVoucher(promotionId, voucherId);
  }

  @Patch(':promotionId/vouchers/:voucherId')
  updateVoucher(
    @Param('promotionId', ParseIntPipe) promotionId: number,
    @Param('voucherId', ParseIntPipe) voucherId: number,
    @Body() input: UpdateVoucherDto,
  ) {
    return this.promotions.updateVoucher(promotionId, voucherId, input);
  }
}
