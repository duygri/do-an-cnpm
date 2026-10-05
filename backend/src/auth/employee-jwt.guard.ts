import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { AccessTokenPayload } from './auth.types';
import { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class EmployeeJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
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

    if (payload.actorType !== undefined && payload.actorType !== 'employee') {
      throw new UnauthorizedException();
    }

    const employeeId = Number(payload.sub);

    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      throw new UnauthorizedException();
    }

    const employee = await this.employees.findOne({
      where: { employeeId, status: 'active' },
      select: {
        employeeId: true,
        name: true,
        email: true,
        position: true,
        role: true,
      },
    });

    if (!employee) {
      throw new UnauthorizedException();
    }

    request.employee = employee;
    return true;
  }
}
