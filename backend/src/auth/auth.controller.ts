import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { EmployeeLoginDto } from './dto/employee-login.dto';
import { EmployeeJwtGuard } from './employee-jwt.guard';
import type { AuthenticatedRequest } from './authenticated-request';

@Controller('auth/employee')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  signIn(@Body() credentials: EmployeeLoginDto) {
    return this.authService.signIn(credentials);
  }

  @Get('profile')
  @UseGuards(EmployeeJwtGuard)
  getProfile(@Req() request: AuthenticatedRequest) {
    return request.employee;
  }
}
