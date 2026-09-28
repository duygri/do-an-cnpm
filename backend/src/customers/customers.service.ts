import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AccessTokenPayload } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { CustomerProfile, toCustomerProfile } from './customer-profile';
import { Customer } from './entities/customer.entity';
import { LoginCustomerDto } from './dto/login-customer.dto';
import { RegisterCustomerDto } from './dto/register-customer.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';

const TOKEN_LIFETIME_SECONDS = 900;

export interface CustomerAuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  customer: CustomerProfile;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterCustomerDto): Promise<CustomerAuthResponse> {
    const customer = this.customers.create({
      name: input.name.trim(),
      email: this.normalizeEmail(input.email),
      dateOfBirth: input.dateOfBirth ?? null,
      phone: input.phone?.trim() || null,
      gender: input.gender?.trim() || null,
      address: input.address?.trim() || null,
      passwordHash: await this.passwords.hash(input.password),
    });

    try {
      return await this.createAuthResponse(await this.customers.save(customer));
    } catch (error: unknown) {
      if (this.isEmailConflict(error)) {
        throw new ConflictException('Email này đã được đăng ký.');
      }

      throw error;
    }
  }

  async login(input: LoginCustomerDto): Promise<CustomerAuthResponse> {
    const email = this.normalizeEmail(input.email);
    const customer = await this.customers.findOneBy({ email });
    const passwordMatches = await this.passwords.verify(
      input.password,
      customer?.passwordHash ?? null,
    );

    if (!customer || !passwordMatches) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    }

    return this.createAuthResponse(customer);
  }

  async updateProfile(
    customerId: number,
    input: UpdateCustomerProfileDto,
  ): Promise<CustomerProfile> {
    if (
      input.name === undefined &&
      input.dateOfBirth === undefined &&
      input.phone === undefined &&
      input.address === undefined &&
      input.gender === undefined
    ) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    const customer = await this.customers.findOneBy({ customerId });

    if (!customer) {
      throw new UnauthorizedException();
    }

    if (input.name !== undefined) {
      customer.name = input.name.trim();
    }
    if (input.dateOfBirth !== undefined) {
      customer.dateOfBirth = input.dateOfBirth;
    }
    if (input.phone !== undefined) {
      customer.phone = input.phone?.trim() || null;
    }
    if (input.address !== undefined) {
      customer.address = input.address?.trim() || null;
    }
    if (input.gender !== undefined) {
      customer.gender = input.gender?.trim() || null;
    }

    return toCustomerProfile(await this.customers.save(customer));
  }

  private async createAuthResponse(
    customer: Customer,
  ): Promise<CustomerAuthResponse> {
    const payload: AccessTokenPayload = {
      sub: String(customer.customerId),
      actorType: 'customer',
    };

    return {
      access_token: await this.jwt.signAsync(payload),
      token_type: 'Bearer',
      expires_in: TOKEN_LIFETIME_SECONDS,
      customer: toCustomerProfile(customer),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private isEmailConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError: unknown = error.driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23505' &&
      'constraint' in driverError &&
      driverError.constraint === 'UQ_customer_email'
    );
  }
}
