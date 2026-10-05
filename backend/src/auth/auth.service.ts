import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeLoginDto } from './dto/employee-login.dto';
import { EmployeeProfile } from './auth.types';
import { PasswordService } from './password.service';

const TOKEN_LIFETIME_SECONDS = 900;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async signIn(credentials: EmployeeLoginDto): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    employee: EmployeeProfile;
  }> {
    const email = credentials.email.trim().toLowerCase();
    const employee = await this.employees.findOneBy({ email });
    const passwordMatches = await this.passwords.verify(
      credentials.password,
      employee?.passwordHash ?? null,
    );

    if (!employee || employee.status !== 'active' || !passwordMatches) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    const profile: EmployeeProfile = {
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      position: employee.position,
      role: employee.role,
    };

    return {
      access_token: await this.jwt.signAsync({
        sub: String(employee.employeeId),
        actorType: 'employee',
      }),
      token_type: 'Bearer',
      expires_in: TOKEN_LIFETIME_SECONDS,
      employee: profile,
    };
  }
}
