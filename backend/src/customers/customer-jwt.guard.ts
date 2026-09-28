import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { AccessTokenPayload } from '../auth/auth.types';
import { Customer } from './entities/customer.entity';
import { CustomerAuthenticatedRequest } from './customer-authenticated-request';
import { toCustomerProfile } from './customer-profile';

@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<CustomerAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, token, ...extra] = authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
      throw new UnauthorizedException();
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    if (payload.actorType !== 'customer') {
      throw new UnauthorizedException();
    }

    const customerId = Number(payload.sub);

    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
      throw new UnauthorizedException();
    }

    const customer = await this.customers.findOne({
      where: { customerId },
      select: {
        customerId: true,
        name: true,
        email: true,
        dateOfBirth: true,
        phone: true,
        address: true,
        gender: true,
      },
    });

    if (!customer) {
      throw new UnauthorizedException();
    }

    request.customer = toCustomerProfile(customer);
    return true;
  }
}
