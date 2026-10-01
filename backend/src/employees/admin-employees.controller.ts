import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import { EmployeeRoles } from '../auth/employee-roles.decorator';
import { EmployeeRolesGuard } from '../auth/employee-roles.guard';
import { AdminEmployeesService } from './admin-employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { UpdateEmployeeAccessDto } from './dto/update-employee-access.dto';

@Controller('admin/employees')
@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)
@EmployeeRoles('admin')
export class AdminEmployeesController {
  constructor(private readonly employees: AdminEmployeesService) {}

  @Get()
  list(@Query() pagination: ListEmployeesDto) {
    return this.employees.list(pagination);
  }

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateEmployeeDto,
  ) {
    return this.employees.create(request.employee.employeeId, input);
  }

  @Patch(':employeeId')
  updateAccess(
    @Req() request: AuthenticatedRequest,
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() input: UpdateEmployeeAccessDto,
  ) {
    return this.employees.updateAccess(
      request.employee.employeeId,
      employeeId,
      input,
    );
  }
}
