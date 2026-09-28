import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { CustomerAuthenticatedRequest } from './customer-authenticated-request';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomersService } from './customers.service';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

@Controller('auth/customer')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post('register')
  register(@Body() input: RegisterCustomerDto) {
    return this.customers.register(input);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() input: LoginCustomerDto) {
    return this.customers.login(input);
  }

  @Get('profile')
  @UseGuards(CustomerJwtGuard)
  getProfile(@Req() request: CustomerAuthenticatedRequest) {
    return request.customer;
  }

  @Patch('profile')
  @UseGuards(CustomerJwtGuard)
  updateProfile(
    @Req() request: CustomerAuthenticatedRequest,
    @Body() input: UpdateCustomerProfileDto,
  ) {
    return this.customers.updateProfile(request.customer.customerId, input);
  }
}
