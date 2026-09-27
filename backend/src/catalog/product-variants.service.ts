import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductVariantsService {
  constructor(
    @InjectRepository(ProductVariant)
    private readonly variants: Repository<ProductVariant>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  async findAll(productId: number): Promise<ProductVariant[]> {
    await this.findProduct(productId);
    return this.variants.find({
      where: { productId },
      order: { variantId: 'ASC' },
    });
  }

  async create(
    productId: number,
    input: CreateProductVariantDto,
  ): Promise<ProductVariant> {
    const product = await this.findProduct(productId);
    const variant = this.variants.create({
      size: input.size?.trim() || null,
      color: input.color?.trim() || null,
      price: input.price.toFixed(2),
      productId: product.productId,
      product,
    });

    return this.variants.save(variant);
  }

  async update(
    productId: number,
    variantId: number,
    input: UpdateProductVariantDto,
  ): Promise<ProductVariant> {
    if (
      input.size === undefined &&
      input.color === undefined &&
      input.price === undefined
    ) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    await this.findProduct(productId);
    const variant = await this.findVariant(productId, variantId);

    if (input.size !== undefined) {
      variant.size = input.size?.trim() || null;
    }

    if (input.color !== undefined) {
      variant.color = input.color?.trim() || null;
    }

    if (input.price !== undefined) {
      variant.price = input.price.toFixed(2);
    }

    return this.variants.save(variant);
  }

  async remove(productId: number, variantId: number): Promise<void> {
    await this.findProduct(productId);
    const variant = await this.findVariant(productId, variantId);

    try {
      await this.variants.remove(variant);
    } catch (error: unknown) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xóa biến thể đang được dữ liệu khác sử dụng.',
        );
      }

      throw error;
    }
  }

  private async findProduct(productId: number): Promise<Product> {
    const product = await this.products.findOneBy({ productId });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    return product;
  }

  private async findVariant(
    productId: number,
    variantId: number,
  ): Promise<ProductVariant> {
    const variant = await this.variants.findOneBy({ variantId, productId });

    if (!variant) {
      throw new NotFoundException(
        'Không tìm thấy biến thể thuộc sản phẩm này.',
      );
    }

    return variant;
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
