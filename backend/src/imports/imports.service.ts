import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { EmployeeProfile } from '../auth/auth.types';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportDetail } from './entities/import-detail.entity';
import { StockImport } from './entities/stock-import.entity';

@Injectable()
export class ImportsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StockImport)
    private readonly imports: Repository<StockImport>,
  ) {}

  findAll(): Promise<StockImport[]> {
    return this.imports.find({
      relations: { supplier: true },
      order: { importDate: 'DESC', importId: 'DESC' },
    });
  }

  async findOne(importId: number): Promise<StockImport> {
    const stockImport = await this.imports.findOne({
      where: { importId },
      relations: {
        supplier: true,
        details: { variant: true },
      },
    });

    if (!stockImport) {
      throw new NotFoundException('Không tìm thấy phiếu nhập.');
    }

    return stockImport;
  }

  async create(
    input: CreateImportDto,
    employee: EmployeeProfile,
  ): Promise<StockImport> {
    const variantIds = input.details.map((detail) => detail.variantId);

    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'Mỗi biến thể chỉ được xuất hiện một lần trong phiếu nhập.',
      );
    }

    try {
      const importId = await this.dataSource.transaction(async (manager) => {
        const supplier = await manager
          .getRepository(Supplier)
          .findOneBy({ supplierId: input.supplierId });

        if (!supplier) {
          throw new NotFoundException('Không tìm thấy nhà cung cấp.');
        }

        const sortedVariantIds = [...variantIds].sort(
          (left, right) => left - right,
        );
        const variants = await manager
          .getRepository(ProductVariant)
          .createQueryBuilder('variant')
          .where('variant.variantId IN (:...variantIds)', {
            variantIds: sortedVariantIds,
          })
          .orderBy('variant.variantId', 'ASC')
          .getMany();

        if (variants.length !== variantIds.length) {
          const foundIds = new Set(
            variants.map((variant) => variant.variantId),
          );
          const missingId = sortedVariantIds.find((id) => !foundIds.has(id));
          throw new NotFoundException(
            `Không tìm thấy biến thể sản phẩm${missingId ? ` ${missingId}` : ''}.`,
          );
        }

        const calculatedDetails = input.details.map((detail) => {
          const unitPriceCents = this.toCents(detail.unitPrice);
          const subtotalCents = unitPriceCents * BigInt(detail.quantity);

          return {
            detail,
            unitPrice: this.fromCents(unitPriceCents),
            subtotal: this.fromCents(subtotalCents),
            subtotalCents,
          };
        });
        const totalCents = calculatedDetails.reduce(
          (total, detail) => total + detail.subtotalCents,
          0n,
        );
        const importDate = new Date();
        const stockImport = await manager.getRepository(StockImport).save(
          manager.getRepository(StockImport).create({
            importDate,
            totalAmount: this.fromCents(totalCents),
            note: input.note?.trim() || null,
            supplierId: supplier.supplierId,
            employeeId: employee.employeeId,
          }),
        );

        const details = calculatedDetails.map(
          ({ detail, unitPrice, subtotal }) =>
            manager.getRepository(ImportDetail).create({
              importId: stockImport.importId,
              variantId: detail.variantId,
              quantity: detail.quantity,
              unitPrice,
              subtotal,
            }),
        );
        await manager.getRepository(ImportDetail).save(details);

        return stockImport.importId;
      });

      return this.findOne(importId);
    } catch (error: unknown) {
      if (error instanceof QueryFailedError) {
        const driverError: unknown = error.driverError;
        if (
          typeof driverError === 'object' &&
          driverError !== null &&
          'code' in driverError
        ) {
          if (driverError.code === '23503') {
            throw new BadRequestException(
              'Nhà cung cấp hoặc biến thể không còn tồn tại.',
            );
          }
          if (driverError.code === '23505') {
            throw new ConflictException(
              'Biến thể sản phẩm bị trùng trong phiếu nhập.',
            );
          }
        }
      }

      throw error;
    }
  }

  private toCents(value: string): bigint {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  }

  private fromCents(value: bigint): string {
    return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
  }
}
