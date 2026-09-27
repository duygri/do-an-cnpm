import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categories.find({ order: { categoryId: 'ASC' } });
  }

  async findOne(categoryId: number): Promise<Category> {
    const category = await this.categories.findOneBy({ categoryId });

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }

    return category;
  }

  async create(input: CreateCategoryDto): Promise<Category> {
    const category = this.categories.create({
      name: input.name,
      description: input.description ?? null,
    });

    return this.categories.save(category);
  }

  async update(
    categoryId: number,
    input: UpdateCategoryDto,
  ): Promise<Category> {
    if (input.name === undefined && input.description === undefined) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    const category = await this.findOne(categoryId);

    if (input.name !== undefined) {
      category.name = input.name;
    }

    if (input.description !== undefined) {
      category.description = input.description;
    }

    return this.categories.save(category);
  }

  async remove(categoryId: number): Promise<void> {
    const category = await this.findOne(categoryId);

    try {
      await this.categories.remove(category);
    } catch (error: unknown) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Không thể xóa danh mục đang được sản phẩm sử dụng.',
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
