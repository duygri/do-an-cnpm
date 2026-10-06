import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { EmployeeJwtGuard } from '../auth/employee-jwt.guard';
import { EmployeeRoles } from '../auth/employee-roles.decorator';
import { EmployeeRolesGuard } from '../auth/employee-roles.guard';
import { GetRevenueReportDto } from './dto/get-revenue-report.dto';
import { RevenueReportService } from './revenue-report.service';

@Controller('admin/reports')
@UseGuards(EmployeeJwtGuard, EmployeeRolesGuard)
@EmployeeRoles('admin')
export class RevenueReportController {
  constructor(private readonly revenue: RevenueReportService) {}

  @Get('revenue')
  getRevenueReport(@Query() query: GetRevenueReportDto) {
    return this.revenue.getRevenueReport(query);
  }
}
