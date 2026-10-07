import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { Customer } from '../customers/entities/customer.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRefreshToken } from './entities/auth-refresh-token.entity';
import { EmployeeJwtGuard } from './employee-jwt.guard';
import { EmployeeRolesGuard } from './employee-roles.guard';
import { PasswordService } from './password.service';
import { RefreshSessionsService } from './refresh-sessions.service';
import { RefreshTokenCleanupScheduler } from './refresh-token-cleanup.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee, Customer, AuthRefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.getOrThrow<string>('JWT_SECRET');

        if (
          Buffer.byteLength(secret) < 32 ||
          secret === 'REPLACE_WITH_RANDOM_64_HEX_SECRET'
        ) {
          throw new Error('JWT_SECRET must be a private random secret.');
        }

        return {
          secret,
          signOptions: { expiresIn: 900 },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshSessionsService,
    RefreshTokenCleanupScheduler,
    EmployeeJwtGuard,
    EmployeeRolesGuard,
    PasswordService,
  ],
  exports: [
    EmployeeJwtGuard,
    EmployeeRolesGuard,
    JwtModule,
    PasswordService,
    RefreshSessionsService,
    TypeOrmModule,
  ],
})
export class AuthModule {}
