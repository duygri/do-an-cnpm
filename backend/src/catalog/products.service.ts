import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductImageInputDto } from './dto/product-image-input.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';

type NormalizedProductImage = {
  imageUrl: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<Product[]> {
    return this.products.find({
      relations: { category: true, images: true },
      order: {
        productId: 'ASC',
        images: { sortOrder: 'ASC', productImageId: 'ASC' },
      },
    });
  }

  async findOne(productId: number): Promise<Product> {
    const product = await this.products.findOne({
      where: { productId },
      relations: { category: true, images: true },
      order: { images: { sortOrder: 'ASC', productImageId: 'ASC' } },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    return product;
  }

  async create(input: CreateProductDto): Promise<Product> {
    const images = this.normalizeImages(input.images ?? []);

    return this.dataSource.transaction(async (manager) => {
      const categories = manager.getRepository(Category);
      const category = await categories.findOneBy({
        categoryId: input.categoryId,
      });

      if (!category) {
        throw new NotFoundException('Không tìm thấy danh mục.');
      }

      const products = manager.getRepository(Product);
      const product = products.create({
        name: input.name.trim(),
        description: input.description ?? null,
        brand: input.brand?.trim() || null,
        status: input.status?.trim() || 'active',
        categoryId: category.categoryId,
        category,
      });
      const savedProduct = await products.save(product);

      if (images.length > 0) {
        const imageRepository = manager.getRepository(ProductImage);
        await imageRepository.save(
          images.map((image) =>
            imageRepository.create({
              ...image,
              productId: savedProduct.productId,
            }),
          ),
        );
      }

      const result = await products.findOne({
        where: { productId: savedProduct.productId },
        relations: { category: true, images: true },
        order: { images: { sortOrder: 'ASC', productImageId: 'ASC' } },
      });
      if (!result) {
        throw new NotFoundException('Không tìm thấy sản phẩm.');
      }
      return result;
    });
  }

  async update(productId: number, input: UpdateProductDto): Promise<Product> {
    if (
      input.name === undefined &&
      input.description === undefined &&
      input.brand === undefined &&
      input.status === undefined &&
      input.categoryId === undefined &&
      input.images === undefined
    ) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất một trường để cập nhật.',
      );
    }

    const images =
      input.images === undefined
        ? undefined
        : this.normalizeImages(input.images);

    return this.dataSource.transaction(async (manager) => {
      const products = manager.getRepository(Product);
      const product = await products.findOne({
        where: { productId },
        relations: { category: true },
      });

      if (!product) {
        throw new NotFoundException('Không tìm thấy sản phẩm.');
      }

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
        const category = await manager
          .getRepository(Category)
          .findOneBy({ categoryId: input.categoryId });
        if (!category) {
          throw new NotFoundException('Không tìm thấy danh mục.');
        }
        product.categoryId = category.categoryId;
        product.category = category;
      }

      const savedProduct = await products.save(product);
      if (images !== undefined) {
        const imageRepository = manager.getRepository(ProductImage);
        await imageRepository.delete({ productId: savedProduct.productId });
        if (images.length > 0) {
          await imageRepository.save(
            images.map((image) =>
              imageRepository.create({
                ...image,
                productId: savedProduct.productId,
              }),
            ),
          );
        }
      }

      const result = await products.findOne({
        where: { productId: savedProduct.productId },
        relations: { category: true, images: true },
        order: { images: { sortOrder: 'ASC', productImageId: 'ASC' } },
      });
      if (!result) {
        throw new NotFoundException('Không tìm thấy sản phẩm.');
      }
      return result;
    });
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

  private normalizeImages(
    images: ProductImageInputDto[],
  ): NormalizedProductImage[] {
    const normalized = images.map((image, index) => ({
      imageUrl: image.imageUrl.trim(),
      altText: image.altText?.trim() || null,
      sortOrder: image.sortOrder ?? index,
      isPrimary: image.isPrimary === true,
    }));
    const primaryIndexes = normalized.flatMap((image, index) =>
      image.isPrimary ? [index] : [],
    );

    if (primaryIndexes.length > 1) {
      throw new BadRequestException('Chỉ được chọn một ảnh chính.');
    }

    if (normalized.length > 0 && primaryIndexes.length === 0) {
      let primaryIndex = 0;
      for (let index = 1; index < normalized.length; index += 1) {
        if (normalized[index].sortOrder < normalized[primaryIndex].sortOrder) {
          primaryIndex = index;
        }
      }
      normalized[primaryIndex].isPrimary = true;
    }

    return normalized;
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
