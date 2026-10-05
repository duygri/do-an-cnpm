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
import { EmployeeRoles } from '../auth/employee-roles.decorator';
import { EmployeeRolesGuard } from '../auth/employee-roles.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)
@EmployeeRoles('purchasing_staff')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  findAll() {
    return this.suppliers.findAll();
  }

  @Get(':supplierId')
  findOne(@Param('supplierId', ParseIntPipe) supplierId: number) {
    return this.suppliers.findOne(supplierId);
  }

  @Post()
  create(@Body() input: CreateSupplierDto) {
    return this.suppliers.create(input);
  }

  @Patch(':supplierId')
  update(
    @Param('supplierId', ParseIntPipe) supplierId: number,
    @Body() input: UpdateSupplierDto,
  ) {
    return this.suppliers.update(supplierId, input);
  }

  @Delete(':supplierId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('supplierId', ParseIntPipe) supplierId: number) {
    return this.suppliers.remove(supplierId);
  }
}
