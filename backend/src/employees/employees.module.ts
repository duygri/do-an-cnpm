import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Employee } from './entities/employee.entity';
import { EmployeesAdminController } from './employees-admin.controller';
import { EmployeesService } from './employees.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Employee])],
  controllers: [EmployeesAdminController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
