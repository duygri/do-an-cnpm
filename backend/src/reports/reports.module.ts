import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { RevenueReportController } from './revenue-report.controller';
import { RevenueReportService } from './revenue-report.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([SalesOrder])],
  controllers: [RevenueReportController],
  providers: [RevenueReportService],
})
export class ReportsModule {}
