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
import { EmployeeRolesGuard } from '../auth/employee-roles.guard';
import { EmployeeRoles } from '../auth/employee-roles.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)
@EmployeeRoles('catalog_manager')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll() {
    return this.products.findAll();
  }

  @Get(':productId')
  findOne(@Param('productId', ParseIntPipe) productId: number) {
    return this.products.findOne(productId);
  }

  @Post()
  create(@Body() input: CreateProductDto) {
    return this.products.create(input);
  }

  @Patch(':productId')
  update(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() input: UpdateProductDto,
  ) {
    return this.products.update(productId, input);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('productId', ParseIntPipe) productId: number) {
    return this.products.remove(productId);
  }
}
