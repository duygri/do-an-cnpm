import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { PasswordService } from '../auth/password.service';
import type { EmployeeRole } from './employee-role';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { UpdateEmployeeAccessDto } from './dto/update-employee-access.dto';

const EMPLOYEE_MUTATION_LOCK_ID = '2026100601';

export interface EmployeeAdminRecord {
  employeeId: number;
  name: string;
  email: string;
  phone: string | null;
  position: string;
  role: EmployeeRole;
  status: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: ListEmployeesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.employees.findAndCount({
      select: {
        employeeId: true,
        name: true,
        email: true,
        phone: true,
        position: true,
        role: true,
        status: true,
      },
      order: { employeeId: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map((employee) => this.toAdminRecord(employee)),
      page,
      limit,
      total,
    };
  }

  async create(
    input: CreateEmployeeDto,
    actorEmployeeId: number,
  ): Promise<EmployeeAdminRecord> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(input.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.acquireMutationLock(manager);
        await this.assertActorIsActiveAdmin(manager, actorEmployeeId);

        const duplicate = await manager
          .getRepository(Employee)
          .createQueryBuilder('employee')
          .where('LOWER(BTRIM(employee.email)) = :email', {
            email: normalizedEmail,
          })
          .getExists();
        if (duplicate) {
          throw new ConflictException('Địa chỉ email nhân viên đã tồn tại.');
        }

        const employee = manager.getRepository(Employee).create({
          name: input.name.trim(),
          email: normalizedEmail,
          phone: input.phone ?? null,
          passwordHash,
          position: input.position.trim(),
          role: input.role,
          status: 'active',
        });
        const saved = await manager.getRepository(Employee).save(employee);
        return this.toAdminRecord(saved);
      });
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Địa chỉ email nhân viên đã tồn tại.');
      }
      throw error;
    }
  }

  async updateAccess(
    employeeId: number,
    input: UpdateEmployeeAccessDto,
    actorEmployeeId: number,
  ): Promise<EmployeeAdminRecord> {
    if (
      !Number.isSafeInteger(employeeId) ||
      employeeId < 1 ||
      employeeId > 2_147_483_647
    ) {
      throw new BadRequestException('Mã nhân viên không hợp lệ.');
    }

    if (input.role === undefined && input.status === undefined) {
      throw new BadRequestException(
        'Cần cung cấp vai trò hoặc trạng thái mới.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await this.acquireMutationLock(manager);
      await this.assertActorIsActiveAdmin(manager, actorEmployeeId);

      const employees = manager.getRepository(Employee);
      const employee = await employees.findOne({
        where: { employeeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!employee) {
        throw new NotFoundException('Không tìm thấy nhân viên.');
      }

      const removesActiveAdmin =
        employee.role === 'admin' &&
        employee.status === 'active' &&
        ((input.role !== undefined && input.role !== 'admin') ||
          (input.status !== undefined && input.status !== 'active'));

      if (removesActiveAdmin && employeeId === actorEmployeeId) {
        throw new ConflictException(
          'Không thể hạ quyền hoặc vô hiệu hóa tài khoản quản trị của chính mình.',
        );
      }

      if (removesActiveAdmin) {
        const activeAdminCount = await this.countActiveAdmins(manager);
        if (activeAdminCount <= 1) {
          throw new ConflictException(
            'Hệ thống phải luôn có ít nhất một quản trị viên đang hoạt động.',
          );
        }
      }

      if (input.role !== undefined) employee.role = input.role;
      if (input.status !== undefined) employee.status = input.status;

      const saved = await employees.save(employee);
      return this.toAdminRecord(saved);
    });
  }

  private async acquireMutationLock(manager: EntityManager): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      EMPLOYEE_MUTATION_LOCK_ID,
    ]);
  }

  private async assertActorIsActiveAdmin(
    manager: EntityManager,
    actorEmployeeId: number,
  ): Promise<void> {
    const actor = await manager.getRepository(Employee).findOne({
      where: { employeeId: actorEmployeeId },
      select: { employeeId: true, role: true, status: true },
    });
    if (!actor || actor.status !== 'active' || actor.role !== 'admin') {
      throw new ForbiddenException(
        'Quyền quản trị đã thay đổi; hãy đăng nhập lại.',
      );
    }
  }

  private countActiveAdmins(manager: EntityManager): Promise<number> {
    return manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .where('employee.role = :role', { role: 'admin' })
      .andWhere('employee.status = :status', { status: 'active' })
      .getCount();
  }

  private toAdminRecord(employee: Employee): EmployeeAdminRecord {
    return {
      employeeId: employee.employeeId,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      position: employee.position,
      role: employee.role,
      status: employee.status,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;

    const driverError: unknown = error.driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23505'
    );
  }
}
