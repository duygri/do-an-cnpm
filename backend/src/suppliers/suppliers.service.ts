import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Supplier } from './entities/supplier.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly suppliers: Repository<Supplier>,
  ) {}

  findAll(): Promise<Supplier[]> {
    return this.suppliers.find({ order: { supplierId: 'ASC' } });
  }

  async findOne(supplierId: number): Promise<Supplier> {
    const supplier = await this.suppliers.findOneBy({ supplierId });

    if (!supplier) {
      throw new NotFoundException('Không tìm thấy nhà cung cấp.');
    }

    return supplier;
  }

  create(input: CreateSupplierDto): Promise<Supplier> {
    return this.suppliers.save(
      this.suppliers.create({
        name: input.name,
        address: input.address?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
      }),
    );
  }

  async update(
    supplierId: number,
    input: UpdateSupplierDto,
  ): Promise<Supplier> {
    if (
      input.name === undefined &&
      input.address === undefined &&
      input.email === undefined
    ) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    const supplier = await this.findOne(supplierId);

    if (input.name !== undefined) {
      supplier.name = input.name;
    }
    if (input.address !== undefined) {
      supplier.address = input.address?.trim() || null;
    }
    if (input.email !== undefined) {
      supplier.email = input.email?.trim().toLowerCase() || null;
    }

    return this.suppliers.save(supplier);
  }

  async remove(supplierId: number): Promise<void> {
    const supplier = await this.findOne(supplierId);

    try {
      await this.suppliers.remove(supplier);
    } catch (error: unknown) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xóa nhà cung cấp đã được sử dụng trong phiếu nhập.',
        );
      }

      throw error;
    }
  }

  private isForeignKeyViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError: unknown = error.driverError;
    return (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23503'
    );
  }
}
