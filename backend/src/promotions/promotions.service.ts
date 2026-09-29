import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository, DataSource } from 'typeorm';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';
import { Promotion, PromotionStatus } from './entities/promotion.entity';
import {
  PromotionDetail,
  PromotionDetailStatus,
  PromotionDetailType,
} from './entities/promotion-detail.entity';

const MONEY_PATTERN =
  /^(?=0*(?:[1-9]\d{0,21})?(?:\.|$))\d+(?:\.\d{1,2})?(?![\s\S])/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DUPLICATE_VOUCHER_CODE_CONSTRAINT = 'UQ_promotion_detail_code';

export interface PromotionResponse {
  promotionId: number;
  name: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: PromotionStatus;
}

export interface VoucherResponse {
  voucherId: number;
  promotionId: number;
  code: string;
  name: string;
  type: PromotionDetailType;
  discountValue: string;
  startDate: string;
  endDate: string;
  minPrice: string;
  maxDiscount: string | null;
  quantity: number;
  status: PromotionDetailStatus;
}

@Injectable()
export class PromotionsService {
  constructor(
    @InjectRepository(Promotion)
    private readonly promotions: Repository<Promotion>,
    @InjectRepository(PromotionDetail)
    private readonly vouchers: Repository<PromotionDetail>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<PromotionResponse[]> {
    const promotions = await this.promotions.find({
      order: { promotionId: 'ASC' },
    });
    return promotions.map((promotion) => this.toPromotionResponse(promotion));
  }

  async findOne(promotionId: number): Promise<PromotionResponse> {
    return this.toPromotionResponse(await this.findPromotion(promotionId));
  }

  async create(input: CreatePromotionDto): Promise<PromotionResponse> {
    this.assertDateRange(input.startDate, input.endDate, 'Promotion');
    const promotion = this.promotions.create({
      name: input.name,
      description: input.description ?? null,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status ?? 'active',
    });
    return this.toPromotionResponse(await this.promotions.save(promotion));
  }

  async update(
    promotionId: number,
    input: UpdatePromotionDto,
  ): Promise<PromotionResponse> {
    if (this.isEmptyPatch(input)) {
      throw new BadRequestException(
        'Provide at least one field to update the promotion.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const promotionRepository = manager.getRepository(Promotion);
      const promotion = await promotionRepository
        .createQueryBuilder('promotion')
        .where('promotion.promotionId = :promotionId', { promotionId })
        .setLock('pessimistic_write')
        .getOne();

      if (!promotion) {
        throw new NotFoundException('Promotion not found.');
      }

      const finalStartDate = input.startDate ?? promotion.startDate;
      const finalEndDate = input.endDate ?? promotion.endDate;
      this.assertDateRange(finalStartDate, finalEndDate, 'Promotion');

      if (input.name !== undefined) promotion.name = input.name;
      if (input.description !== undefined) {
        promotion.description = input.description;
      }
      promotion.startDate = finalStartDate;
      promotion.endDate = finalEndDate;
      if (input.status !== undefined) promotion.status = input.status;

      return this.toPromotionResponse(
        await promotionRepository.save(promotion),
      );
    });
  }

  async findVouchers(promotionId: number): Promise<VoucherResponse[]> {
    await this.findPromotion(promotionId);
    const vouchers = await this.vouchers.find({
      where: { promotionId },
      order: { voucherId: 'ASC' },
    });
    return vouchers.map((voucher) => this.toVoucherResponse(voucher));
  }

  async findVoucher(
    promotionId: number,
    voucherId: number,
  ): Promise<VoucherResponse> {
    await this.findPromotion(promotionId);
    const voucher = await this.vouchers.findOneBy({ voucherId, promotionId });
    if (!voucher) {
      throw new NotFoundException('Voucher not found for this promotion.');
    }
    return this.toVoucherResponse(voucher);
  }

  async createVoucher(
    promotionId: number,
    input: CreateVoucherDto,
  ): Promise<VoucherResponse> {
    await this.findPromotion(promotionId);
    this.assertVoucherValues({
      type: input.type,
      discountValue: input.discountValue,
      startDate: input.startDate,
      endDate: input.endDate,
      minPrice: input.minPrice,
      maxDiscount: input.maxDiscount ?? null,
      quantity: input.quantity,
    });

    const voucher = this.vouchers.create({
      promotionId,
      code: input.code,
      name: input.name,
      type: input.type,
      discountValue: input.discountValue,
      startDate: input.startDate,
      endDate: input.endDate,
      minPrice: input.minPrice,
      maxDiscount: input.maxDiscount ?? null,
      quantity: input.quantity,
      status: input.status ?? 'active',
    });

    try {
      return this.toVoucherResponse(await this.vouchers.save(voucher));
    } catch (error: unknown) {
      this.throwIfDuplicateVoucherCode(error);
      throw error;
    }
  }

  async updateVoucher(
    promotionId: number,
    voucherId: number,
    input: UpdateVoucherDto,
  ): Promise<VoucherResponse> {
    if (this.isEmptyPatch(input)) {
      throw new BadRequestException(
        'Provide at least one field to update the voucher.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const promotion = await manager
        .getRepository(Promotion)
        .createQueryBuilder('promotion')
        .where('promotion.promotionId = :promotionId', { promotionId })
        .setLock('pessimistic_write')
        .getOne();

      if (!promotion) {
        throw new NotFoundException('Promotion not found.');
      }

      const voucherRepository = manager.getRepository(PromotionDetail);
      const voucher = await voucherRepository
        .createQueryBuilder('voucher')
        .where('voucher.voucherId = :voucherId', { voucherId })
        .andWhere('voucher.promotionId = :promotionId', { promotionId })
        .setLock('pessimistic_write')
        .getOne();

      if (!voucher) {
        throw new NotFoundException('Voucher not found for this promotion.');
      }

      const finalVoucher = {
        type: input.type ?? voucher.type,
        discountValue: input.discountValue ?? voucher.discountValue,
        startDate: input.startDate ?? voucher.startDate,
        endDate: input.endDate ?? voucher.endDate,
        minPrice: input.minPrice ?? voucher.minPrice,
        maxDiscount:
          input.maxDiscount === undefined
            ? voucher.maxDiscount
            : input.maxDiscount,
        quantity: input.quantity ?? voucher.quantity,
      };
      this.assertVoucherValues(finalVoucher);

      if (input.quantity !== undefined) {
        const redemptionCount = await manager.getRepository(SalesOrder).count({
          where: {
            voucherId,
            status: In(['pending', 'packed']),
          },
        });
        if (input.quantity < redemptionCount) {
          throw new ConflictException(
            `Quantity cannot be lower than the ${redemptionCount} current redemptions.`,
          );
        }
      }

      if (input.name !== undefined) voucher.name = input.name;
      voucher.type = finalVoucher.type;
      voucher.discountValue = finalVoucher.discountValue;
      voucher.startDate = finalVoucher.startDate;
      voucher.endDate = finalVoucher.endDate;
      voucher.minPrice = finalVoucher.minPrice;
      voucher.maxDiscount = finalVoucher.maxDiscount;
      voucher.quantity = finalVoucher.quantity;
      if (input.status !== undefined) voucher.status = input.status;

      try {
        return this.toVoucherResponse(await voucherRepository.save(voucher));
      } catch (error: unknown) {
        this.throwIfDuplicateVoucherCode(error);
        throw error;
      }
    });
  }

  private async findPromotion(promotionId: number): Promise<Promotion> {
    const promotion = await this.promotions.findOneBy({ promotionId });
    if (!promotion) {
      throw new NotFoundException('Promotion not found.');
    }
    return promotion;
  }

  private assertDateRange(
    startDate: string,
    endDate: string,
    resourceName: string,
  ): void {
    if (!this.isValidDate(startDate) || !this.isValidDate(endDate)) {
      throw new BadRequestException(
        `${resourceName} dates must be valid YYYY-MM-DD dates.`,
      );
    }
    if (startDate > endDate) {
      throw new BadRequestException(
        `${resourceName} startDate must be on or before endDate.`,
      );
    }
  }

  private assertVoucherValues(values: {
    type: string;
    discountValue: string;
    startDate: string;
    endDate: string;
    minPrice: string;
    maxDiscount: string | null;
    quantity: number;
  }): void {
    if (values.type !== 'fixed' && values.type !== 'percentage') {
      throw new BadRequestException(
        'Voucher type must be fixed or percentage.',
      );
    }
    const discountCents = this.parseMoneyCents(
      values.discountValue,
      'discountValue',
      false,
    );
    if (values.type === 'percentage' && discountCents > 10_000n) {
      throw new BadRequestException(
        'Percentage discountValue cannot exceed 100.',
      );
    }
    if (
      !this.isValidDate(values.startDate) ||
      !this.isValidDate(values.endDate)
    ) {
      throw new BadRequestException(
        'Voucher dates must be valid YYYY-MM-DD dates.',
      );
    }
    if (values.startDate > values.endDate) {
      throw new BadRequestException(
        'Voucher startDate must be on or before endDate.',
      );
    }
    this.parseMoneyCents(values.minPrice, 'minPrice', true);
    if (values.maxDiscount !== null) {
      if (values.type !== 'percentage') {
        throw new BadRequestException(
          'maxDiscount can only be set for percentage vouchers.',
        );
      }
      this.parseMoneyCents(values.maxDiscount, 'maxDiscount', false);
    }
    if (
      !Number.isInteger(values.quantity) ||
      values.quantity < 1 ||
      values.quantity > 2_147_483_647
    ) {
      throw new BadRequestException('quantity must be a positive integer.');
    }
  }

  private isValidDate(value: string): boolean {
    if (!DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12) return false;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day >= 1 && day <= daysInMonth;
  }

  private parseMoneyCents(
    value: string,
    fieldName: string,
    allowZero: boolean,
  ): bigint {
    if (!MONEY_PATTERN.test(value)) {
      throw new BadRequestException(
        `${fieldName} must fit numeric(24,2) and have at most two fractional digits.`,
      );
    }

    const [integerPart, fractionalPart = ''] = value.split('.');
    const significantIntegerPart = integerPart.replace(/^0+/, '') || '0';
    if (significantIntegerPart.length > 22) {
      throw new BadRequestException(
        `${fieldName} exceeds the numeric(24,2) range.`,
      );
    }

    const cents =
      BigInt(significantIntegerPart) * 100n +
      BigInt(fractionalPart.padEnd(2, '0'));
    if (!allowZero && cents === 0n) {
      throw new BadRequestException(`${fieldName} must be positive.`);
    }
    return cents;
  }

  private isEmptyPatch(input: object): boolean {
    return Object.values(input).every((value) => value === undefined);
  }

  private toPromotionResponse(promotion: Promotion): PromotionResponse {
    return {
      promotionId: promotion.promotionId,
      name: promotion.name,
      description: promotion.description,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      status: promotion.status,
    };
  }

  private toVoucherResponse(voucher: PromotionDetail): VoucherResponse {
    return {
      voucherId: voucher.voucherId,
      promotionId: voucher.promotionId,
      code: voucher.code,
      name: voucher.name,
      type: voucher.type,
      discountValue: voucher.discountValue,
      startDate: voucher.startDate,
      endDate: voucher.endDate,
      minPrice: voucher.minPrice,
      maxDiscount: voucher.maxDiscount,
      quantity: voucher.quantity,
      status: voucher.status,
    };
  }

  private throwIfDuplicateVoucherCode(error: unknown): void {
    if (!(error instanceof QueryFailedError)) return;
    const driverError: unknown = error.driverError;
    if (
      typeof driverError === 'object' &&
      driverError !== null &&
      'code' in driverError &&
      driverError.code === '23505' &&
      'constraint' in driverError &&
      driverError.constraint === DUPLICATE_VOUCHER_CODE_CONSTRAINT
    ) {
      throw new ConflictException('Voucher code is already in use.');
    }
  }
}
