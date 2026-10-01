import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Employee } from './entities/employee.entity';
import { AdminEmployeesController } from './admin-employees.controller';
import { AdminEmployeesService } from './admin-employees.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Employee])],
  controllers: [AdminEmployeesController],
  providers: [AdminEmployeesService],
})
export class EmployeesModule {}
