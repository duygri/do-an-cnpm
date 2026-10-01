import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmployeeJwtGuard } from './employee-jwt.guard';
import { EmployeeRolesGuard } from './employee-roles.guard';
import { PasswordService } from './password.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Employee]),
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
    EmployeeJwtGuard,
    EmployeeRolesGuard,
    PasswordService,
  ],
  exports: [
    EmployeeJwtGuard,
    EmployeeRolesGuard,
    JwtModule,
    PasswordService,
    TypeOrmModule,
  ],
})
export class AuthModule {}
