import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  findAll(): Promise<Product[]> {
    return this.products.find({
      relations: { category: true },
      order: { productId: 'ASC' },
    });
  }

  async findOne(productId: number): Promise<Product> {
    const product = await this.products.findOne({
      where: { productId },
      relations: { category: true },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    return product;
  }

  async create(input: CreateProductDto): Promise<Product> {
    const category = await this.findCategory(input.categoryId);
    const product = this.products.create({
      name: input.name.trim(),
      description: input.description ?? null,
      brand: input.brand?.trim() || null,
      status: input.status?.trim() || 'active',
      categoryId: category.categoryId,
      category,
    });

    return this.products.save(product);
  }

  async update(productId: number, input: UpdateProductDto): Promise<Product> {
    if (
      input.name === undefined &&
      input.description === undefined &&
      input.brand === undefined &&
      input.status === undefined &&
      input.categoryId === undefined
    ) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    const product = await this.findOne(productId);

    if (input.name !== undefined) {
      product.name = input.name.trim();
    }

    if (input.description !== undefined) {
      product.description = input.description;
    }

    if (input.brand !== undefined) {
      product.brand = input.brand?.trim() || null;
    }

    if (input.status !== undefined) {
      product.status = input.status.trim();
    }

    if (input.categoryId !== undefined) {
      const category = await this.findCategory(input.categoryId);
      product.categoryId = category.categoryId;
      product.category = category;
    }

    return this.products.save(product);
  }

  async remove(productId: number): Promise<void> {
    const product = await this.findOne(productId);

    try {
      await this.products.remove(product);
    } catch (error: unknown) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xóa sản phẩm đang có biến thể hoặc dữ liệu liên quan.',
        );
      }

      throw error;
    }
  }

  private async findCategory(categoryId: number): Promise<Category> {
    const category = await this.categories.findOneBy({ categoryId });

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }

    return category;
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
