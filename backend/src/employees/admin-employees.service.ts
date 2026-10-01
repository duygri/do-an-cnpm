import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service';
import { Employee } from './entities/employee.entity';
import type { EmployeeRole } from './employee-role';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import type { EmployeeStatus } from './dto/update-employee-access.dto';
import { UpdateEmployeeAccessDto } from './dto/update-employee-access.dto';

const EMPLOYEE_ADMIN_MUTATION_LOCK_NAME = 'employee-admin-access-mutations';
const EMPLOYEE_ADMIN_MUTATION_LOCK_KEY = 9_381;

export interface EmployeeAccessProjection {
  employeeId: number;
  name: string;
  email: string;
  phone: string | null;
  position: string;
  role: EmployeeRole;
  status: EmployeeStatus;
}

@Injectable()
export class AdminEmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  async list(pagination: ListEmployeesDto): Promise<{
    page: number;
    limit: number;
    total: number;
    items: EmployeeAccessProjection[];
  }> {
    const { page, limit } = pagination;
    const [employees, total] = await this.employees
      .createQueryBuilder('employee')
      .select([
        'employee.employeeId',
        'employee.name',
        'employee.email',
        'employee.phone',
        'employee.position',
        'employee.role',
        'employee.status',
      ])
      .orderBy('employee.employeeId', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      page,
      limit,
      total,
      items: employees.map((employee) => this.toProjection(employee)),
    };
  }

  async create(
    actorEmployeeId: number,
    input: CreateEmployeeDto,
  ): Promise<EmployeeAccessProjection> {
    const passwordHash = await this.passwords.hash(input.password);
    const normalizedEmail = input.email.trim().toLowerCase();

    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.acquireMutationLock(manager);
        await this.requireActiveAdministrator(manager, actorEmployeeId);
        const activeAdministratorCount =
          await this.countActiveAdministrators(manager);
        if (activeAdministratorCount < 1) {
          throw new ConflictException(
            'An active administrator is required to create employees.',
          );
        }

        const employees = manager.getRepository(Employee);
        const employee = employees.create({
          name: input.name.trim(),
          email: normalizedEmail,
          phone: input.phone?.trim() || null,
          passwordHash,
          position: input.position.trim(),
          role: input.role,
          status: 'active',
        });
        const saved = await employees.save(employee);
        return this.toProjection(saved);
      });
    } catch (error) {
      if (this.isDuplicateEmployeeEmail(error)) {
        throw new ConflictException(
          'An employee with this email already exists.',
        );
      }
      throw error;
    }
  }

  async updateAccess(
    actorEmployeeId: number,
    employeeId: number,
    input: UpdateEmployeeAccessDto,
  ): Promise<EmployeeAccessProjection> {
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
      throw new BadRequestException('Employee ID must be a positive integer.');
    }
    if (input.role === undefined && input.status === undefined) {
      throw new BadRequestException('Provide a role or status to update.');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.acquireMutationLock(manager);
      await this.requireActiveAdministrator(manager, actorEmployeeId);
      const activeAdministratorCount =
        await this.countActiveAdministrators(manager);
      const employees = manager.getRepository(Employee);
      const employee = await employees.findOneBy({ employeeId });

      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }

      const isActiveAdministrator =
        employee.role === 'admin' && employee.status === 'active';
      const isDemotion = input.role !== undefined && input.role !== 'admin';
      const isDeactivation = input.status === 'inactive';
      const removesActiveAdministrator =
        isActiveAdministrator && (isDemotion || isDeactivation);

      if (removesActiveAdministrator && actorEmployeeId === employeeId) {
        throw new ConflictException(
          'An administrator cannot demote or deactivate their own account.',
        );
      }

      if (removesActiveAdministrator && activeAdministratorCount <= 1) {
        throw new ConflictException(
          'The last active administrator cannot be demoted or deactivated.',
        );
      }

      if (input.role !== undefined) employee.role = input.role;
      if (input.status !== undefined) employee.status = input.status;

      const saved = await employees.save(employee);
      return this.toProjection(saved);
    });
  }

  private async acquireMutationLock(manager: {
    query: (query: string, parameters?: unknown[]) => Promise<unknown>;
  }): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', [
      EMPLOYEE_ADMIN_MUTATION_LOCK_NAME,
      EMPLOYEE_ADMIN_MUTATION_LOCK_KEY,
    ]);
  }

  private async requireActiveAdministrator(
    manager: {
      getRepository: (entity: typeof Employee) => Repository<Employee>;
    },
    employeeId: number,
  ): Promise<void> {
    const actor = await manager.getRepository(Employee).findOne({
      where: { employeeId },
      select: { employeeId: true, role: true, status: true },
    });

    if (!actor || actor.status !== 'active' || actor.role !== 'admin') {
      throw new ForbiddenException('An active administrator is required.');
    }
  }

  private async countActiveAdministrators(manager: {
    getRepository: (entity: typeof Employee) => Repository<Employee>;
  }): Promise<number> {
    return manager.getRepository(Employee).countBy({
      role: 'admin',
      status: 'active',
    });
  }

  private toProjection(employee: Employee): EmployeeAccessProjection {
    return {
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      position: employee.position,
      role: employee.role,
      status: employee.status as EmployeeStatus,
    };
  }

  private isDuplicateEmployeeEmail(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('driverError' in error)) {
      return false;
    }

    const driverError = error.driverError;
    return (
      !!driverError &&
      typeof driverError === 'object' &&
      'code' in driverError &&
      driverError.code === '23505' &&
      'constraint' in driverError &&
      driverError.constraint === 'UQ_employee_email'
    );
  }
}
