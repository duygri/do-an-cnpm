import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductVariantsService } from './product-variants.service';

@Controller('products/:productId/variants')
@UseGuards(EmployeeJwtGuard)
export class ProductVariantsController {
  constructor(private readonly variants: ProductVariantsService) {}

  @Get()
  findAll(@Param('productId', ParseIntPipe) productId: number) {
    return this.variants.findAll(productId);
  }

  @Post()
  create(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() input: CreateProductVariantDto,
  ) {
    return this.variants.create(productId, input);
  }

  @Patch(':variantId')
  update(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() input: UpdateProductVariantDto,
  ) {
    return this.variants.update(productId, variantId, input);
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('variantId', ParseIntPipe) variantId: number,
  ) {
    return this.variants.remove(productId, variantId);
  }
}
