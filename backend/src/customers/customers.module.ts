import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Customer } from './entities/customer.entity';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Customer])],
  controllers: [CustomersController],
  providers: [CustomerJwtGuard, CustomersService],
  exports: [CustomerJwtGuard],
})
export class CustomersModule {}
