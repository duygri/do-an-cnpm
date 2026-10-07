import {
  Body,
  Controller,
  UnauthorizedException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { EmployeeLoginDto } from './dto/employee-login.dto';
import { EmployeeJwtGuard } from './employee-jwt.guard';
import type { AuthenticatedRequest } from './authenticated-request';
import {
  assertAllowedSameSiteRequest,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './auth-cookie';
import { RefreshSessionsService } from './refresh-sessions.service';

@Controller('auth/employee')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: RefreshSessionsService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async signIn(
    @Body() credentials: EmployeeLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { refreshToken, ...authResponse } =
      await this.authService.signIn(credentials);
    setRefreshCookie(response, this.config, 'employee', refreshToken);
    return authResponse;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertAllowedSameSiteRequest(request, this.config);
    const refreshToken = readRefreshCookie(request, 'employee');
    if (!refreshToken) {
      clearRefreshCookie(response, this.config, 'employee');
      throw new UnauthorizedException('Refresh session is unavailable.');
    }

    try {
      const result = await this.sessions.rotate('employee', refreshToken);
      setRefreshCookie(
        response,
        this.config,
        'employee',
        result.tokens.refreshToken,
      );
      return result.response;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        clearRefreshCookie(response, this.config, 'employee');
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
    assertAllowedSameSiteRequest(request, this.config);
    await this.sessions.revokeCurrentFamily(
      'employee',
      readRefreshCookie(request, 'employee'),
    );
    clearRefreshCookie(response, this.config, 'employee');
  }

  @Get('profile')
  @UseGuards(EmployeeJwtGuard)
  getProfile(@Req() request: AuthenticatedRequest) {
    return request.employee;
  }
}
