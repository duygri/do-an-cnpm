import {
  BadRequestException,
  ConflictException,
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
import { CreateProductDto } from './dto/create-product.dto';
import { ProductImageInputDto } from './dto/product-image-input.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
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
    const images = this.prepareImages(input.images);

    return this.dataSource.transaction(async (manager) => {
      const category = await this.findCategory(input.categoryId, manager);
      const product = await manager.getRepository(Product).save(
        manager.getRepository(Product).create({
          name: input.name.trim(),
          description: input.description ?? null,
          brand: input.brand?.trim() || null,
          status: input.status?.trim() || 'active',
          categoryId: category.categoryId,
          category,
        }),
      );

      if (images !== undefined && images.length > 0) {
        await manager.getRepository(ProductImage).save(
          images.map((image) =>
            manager.getRepository(ProductImage).create({
              ...image,
              productId: product.productId,
            }),
          ),
        );
      }

      return this.findOneInManager(manager, product.productId);
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

    const images = this.prepareImages(input.images);

    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(Product).findOne({
        where: { productId },
        relations: { category: true, images: true },
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
        const category = await this.findCategory(input.categoryId, manager);
        product.categoryId = category.categoryId;
        product.category = category;
      }

      await manager.getRepository(Product).save(product);

      if (images !== undefined) {
        const imageRepository = manager.getRepository(ProductImage);
        await imageRepository.delete({ productId: product.productId });

        if (images.length > 0) {
          await imageRepository.save(
            images.map((image) =>
              imageRepository.create({
                ...image,
                productId: product.productId,
              }),
            ),
          );
        }
      }

      return this.findOneInManager(manager, product.productId);
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

  private async findCategory(
    categoryId: number,
    manager?: EntityManager,
  ): Promise<Category> {
    const category = manager
      ? await manager.getRepository(Category).findOneBy({ categoryId })
      : await this.categories.findOneBy({ categoryId });

    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục.');
    }

    return category;
  }

  private async findOneInManager(
    manager: EntityManager,
    productId: number,
  ): Promise<Product> {
    const product = await manager.getRepository(Product).findOne({
      where: { productId },
      relations: { category: true, images: true },
      order: { images: { sortOrder: 'ASC', productImageId: 'ASC' } },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    return product;
  }

  private prepareImages(
    input: ProductImageInputDto[] | undefined,
  ):
    | Omit<ProductImage, 'productImageId' | 'product' | 'productId'>[]
    | undefined {
    if (input === undefined) {
      return undefined;
    }

    const primaryIndexes = input
      .map((image, index) => (image.isPrimary === true ? index : -1))
      .filter((index) => index !== -1);

    if (primaryIndexes.length > 1) {
      throw new BadRequestException('Mỗi sản phẩm chỉ được có một ảnh chính.');
    }

    const defaultPrimaryIndex =
      primaryIndexes.length === 0 && input.length > 0
        ? input.reduce((lowestIndex, image, index) => {
            const sortOrder = image.sortOrder ?? index;
            const lowestSortOrder = input[lowestIndex].sortOrder ?? lowestIndex;
            return sortOrder < lowestSortOrder ? index : lowestIndex;
          }, 0)
        : -1;
    const primaryIndex = primaryIndexes[0] ?? defaultPrimaryIndex;
    return input.map((image, index) => ({
      imageUrl: image.imageUrl.trim(),
      altText: image.altText?.trim() || null,
      sortOrder: image.sortOrder ?? index,
      isPrimary: index === primaryIndex,
    }));
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
