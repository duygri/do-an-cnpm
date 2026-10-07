import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { CustomerAuthenticatedRequest } from './customer-authenticated-request';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomersService } from './customers.service';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import {
  assertSameOriginRequest,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '../auth/auth-cookie';
import { RefreshSessionsService } from '../auth/refresh-sessions.service';
import { UnauthorizedException } from '@nestjs/common';

@Controller('auth/customer')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly sessions: RefreshSessionsService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Body() input: RegisterCustomerDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refreshToken, ...authResponse } =
      await this.customers.register(input);
    setRefreshCookie(response, this.config, 'customer', refreshToken);
    return authResponse;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginCustomerDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refreshToken, ...authResponse } = await this.customers.login(input);
    setRefreshCookie(response, this.config, 'customer', refreshToken);
    return authResponse;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertSameOriginRequest(request, this.config);
    const refreshToken = readRefreshCookie(request, 'customer');
    if (!refreshToken) {
      clearRefreshCookie(response, this.config, 'customer');
      throw new UnauthorizedException('Refresh session is unavailable.');
    }

    try {
      const result = await this.sessions.rotate('customer', refreshToken);
      setRefreshCookie(
        response,
        this.config,
        'customer',
        result.tokens.refreshToken,
      );
      return result.response;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        clearRefreshCookie(response, this.config, 'customer');
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    assertSameOriginRequest(request, this.config);
    await this.sessions.revokeCurrentFamily(
      'customer',
      readRefreshCookie(request, 'customer'),
    );
    clearRefreshCookie(response, this.config, 'customer');
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
