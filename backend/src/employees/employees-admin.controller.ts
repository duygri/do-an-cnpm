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
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { UpdateEmployeeAccessDto } from './dto/update-employee-access.dto';
import { EmployeesService } from './employees.service';

@Controller('admin/employees')
@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)
@EmployeeRoles('admin')
export class EmployeesAdminController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@Query() query: ListEmployeesDto) {
    return this.employees.list(query);
  }

  @Post()
  create(
    @Body() input: CreateEmployeeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.employees.create(input, request.employee.employeeId);
  }

  @Patch(':employeeId')
  updateAccess(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() input: UpdateEmployeeAccessDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.employees.updateAccess(
      employeeId,
      input,
      request.employee.employeeId,
    );
  }
}
