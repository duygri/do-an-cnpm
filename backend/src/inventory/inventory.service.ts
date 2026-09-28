import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { EmployeeProfile } from '../auth/auth.types';
import { ProductVariant } from '../catalog/entities/product-variant.entity';
import { CreateOpeningBalancesDto } from './dto/create-opening-balances.dto';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { GetStockBalanceDto } from './dto/get-stock-balance.dto';
import { InventoryMovement } from './entities/inventory-movement.entity';

interface ImportMovementInput {
  variantId: number;
  quantity: number;
}

interface OrderMovementInput {
  variantId: number;
  quantity: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(InventoryMovement)
    private readonly movements: Repository<InventoryMovement>,
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
  ) {}

  async createOpeningBalances(
    input: CreateOpeningBalancesDto,
    employee: EmployeeProfile,
  ): Promise<InventoryMovement[]> {
    const rows = [...input.rows].sort(
      (left, right) => left.variantId - right.variantId,
    );
    const variantIds = rows.map((row) => row.variantId);

    if (new Set(variantIds).size !== variantIds.length) {
      throw new BadRequestException(
        'Mỗi biến thể chỉ được xuất hiện một lần trong danh sách tồn đầu.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await this.lockVariants(manager, variantIds);

      const existing = await manager.getRepository(InventoryMovement).findOne({
        where: { variantId: In(variantIds) },
        select: { movementId: true, variantId: true },
      });

      if (existing) {
        throw new BadRequestException(
          `Biến thể ${existing.variantId} đã có biến động kho, không thể đặt tồn đầu.`,
        );
      }

      const openingRows = rows.map((row) =>
        manager.getRepository(InventoryMovement).create({
          variantId: row.variantId,
          direction: 'in',
          movementType: 'opening',
          quantity: row.quantity,
          employeeId: employee.employeeId,
          importId: null,
          customerId: null,
          orderId: null,
          note: 'Tồn đầu kỳ ban đầu',
        }),
      );

      return manager.getRepository(InventoryMovement).save(openingRows);
    });
  }

  async createAdjustment(
    input: CreateStockAdjustmentDto,
    employee: EmployeeProfile,
  ): Promise<InventoryMovement> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockVariants(manager, [input.variantId]);
      const currentBalance = await this.getCurrentBalance(
        manager,
        input.variantId,
      );

      if (
        input.direction === 'out' &&
        currentBalance < BigInt(input.quantity)
      ) {
        throw new BadRequestException(
          'Số lượng điều chỉnh xuất vượt quá tồn kho hiện tại.',
        );
      }

      return manager.getRepository(InventoryMovement).save(
        manager.getRepository(InventoryMovement).create({
          variantId: input.variantId,
          direction: input.direction,
          movementType: 'adjustment',
          quantity: input.quantity,
          employeeId: employee.employeeId,
          importId: null,
          customerId: null,
          orderId: null,
          note: input.note,
        }),
      );
    });
  }

  async getPeriodBalance(
    variantId: number,
    period: GetStockBalanceDto,
  ): Promise<{
    variantId: number;
    from: string;
    to: string;
    beginningBalance: string;
    inbound: string;
    outbound: string;
    endingBalance: string;
  }> {
    if (!(await this.variants.existsBy({ variantId }))) {
      throw new NotFoundException('Không tìm thấy biến thể sản phẩm.');
    }

    const from = this.parseUtcDate(period.from, 'from');
    const to = this.parseUtcDate(period.to, 'to');

    if (from >= to) {
      throw new BadRequestException('Ngày from phải trước ngày to.');
    }

    const balances = await this.movements
      .createQueryBuilder('movement')
      .select(
        "COALESCE(SUM(CASE WHEN movement.effectiveAt < :from THEN CASE WHEN movement.direction = 'in' THEN movement.quantity ELSE -movement.quantity END ELSE 0 END), 0)",
        'beginning',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN movement.effectiveAt >= :from AND movement.effectiveAt < :to AND movement.direction = 'in' THEN movement.quantity ELSE 0 END), 0)",
        'inbound',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN movement.effectiveAt >= :from AND movement.effectiveAt < :to AND movement.direction = 'out' THEN movement.quantity ELSE 0 END), 0)",
        'outbound',
      )
      .where('movement.variantId = :variantId', { variantId })
      .setParameters({ from, to })
      .getRawOne<{
        beginning: string;
        inbound: string;
        outbound: string;
      }>();
    const beginning = balances?.beginning ?? '0';
    const inbound = balances?.inbound ?? '0';
    const outbound = balances?.outbound ?? '0';

    return {
      variantId,
      from: period.from,
      to: period.to,
      beginningBalance: beginning,
      inbound,
      outbound,
      endingBalance: (
        BigInt(beginning) +
        BigInt(inbound) -
        BigInt(outbound)
      ).toString(),
    };
  }

  async createImportMovements(
    manager: EntityManager,
    importId: number,
    employeeId: number,
    effectiveAt: Date,
    rows: ImportMovementInput[],
  ): Promise<InventoryMovement[]> {
    const movementRepository = manager.getRepository(InventoryMovement);
    return movementRepository.save(
      rows.map((row) =>
        movementRepository.create({
          variantId: row.variantId,
          direction: 'in',
          movementType: 'import',
          quantity: row.quantity,
          effectiveAt,
          employeeId,
          importId,
          customerId: null,
          orderId: null,
          note: null,
        }),
      ),
    );
  }

  async createSaleMovements(
    manager: EntityManager,
    orderId: number,
    customerId: number,
    effectiveAt: Date,
    rows: OrderMovementInput[],
  ): Promise<InventoryMovement[]> {
    const movementRepository = manager.getRepository(InventoryMovement);
    return movementRepository.save(
      rows.map((row) =>
        movementRepository.create({
          variantId: row.variantId,
          direction: 'out',
          movementType: 'sale',
          quantity: row.quantity,
          effectiveAt,
          employeeId: null,
          importId: null,
          customerId,
          orderId,
          note: null,
        }),
      ),
    );
  }

  async createSaleCancellationMovements(
    manager: EntityManager,
    orderId: number,
    customerId: number,
    effectiveAt: Date,
    rows: OrderMovementInput[],
  ): Promise<InventoryMovement[]> {
    const movementRepository = manager.getRepository(InventoryMovement);
    return movementRepository.save(
      rows.map((row) =>
        movementRepository.create({
          variantId: row.variantId,
          direction: 'in',
          movementType: 'sale_cancellation',
          quantity: row.quantity,
          effectiveAt,
          employeeId: null,
          importId: null,
          customerId,
          orderId,
          note: null,
        }),
      ),
    );
  }

  async lockVariants(
    manager: EntityManager,
    variantIds: number[],
  ): Promise<void> {
    const orderedVariantIds = [...new Set(variantIds)].sort(
      (left, right) => left - right,
    );
    if (orderedVariantIds.length === 0) {
      return;
    }

    const variants = await manager
      .getRepository(ProductVariant)
      .createQueryBuilder('variant')
      .where('variant.variantId IN (:...variantIds)', {
        variantIds: orderedVariantIds,
      })
      .orderBy('variant.variantId', 'ASC')
      .setLock('pessimistic_write')
      .getMany();

    if (variants.length !== orderedVariantIds.length) {
      const foundIds = new Set(variants.map((variant) => variant.variantId));
      const missingId = orderedVariantIds.find(
        (variantId) => !foundIds.has(variantId),
      );
      throw new NotFoundException(
        `Không tìm thấy biến thể sản phẩm${missingId ? ` ${missingId}` : ''}.`,
      );
    }
  }

  async getCurrentBalance(
    manager: EntityManager,
    variantId: number,
  ): Promise<bigint> {
    const result = await manager
      .getRepository(InventoryMovement)
      .createQueryBuilder('movement')
      .select(
        `COALESCE(SUM(CASE WHEN movement.direction = 'in' THEN movement.quantity ELSE -movement.quantity END), 0)`,
        'balance',
      )
      .where('movement.variantId = :variantId', { variantId })
      .getRawOne<{ balance: string }>();

    return BigInt(result?.balance ?? '0');
  }

  private parseUtcDate(value: string, field: 'from' | 'to'): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        `Trường ${field} phải có định dạng ngày YYYY-MM-DD.`,
      );
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(`Trường ${field} không phải ngày hợp lệ.`);
    }

    return date;
  }
}
