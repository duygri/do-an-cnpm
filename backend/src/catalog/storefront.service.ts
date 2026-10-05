import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { GetStoreProductsDto } from './dto/get-store-products.dto';

interface StoreProductRow {
  productId: number;
  name: string;
  description: string | null;
  brand: string | null;
  categoryId: number;
  categoryName: string;
  priceFrom: string | null;
  primaryImageUrl: string | null;
}

export interface StoreProductSummary {
  productId: number;
  name: string;
  description: string | null;
  brand: string | null;
  category: { categoryId: number; name: string };
  priceFrom: string | null;
  primaryImageUrl: string | null;
}

@Injectable()
export class StorefrontService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  findCategories(): Promise<Category[]> {
    return this.categories
      .createQueryBuilder('category')
      .innerJoin('category.products', 'product', 'product.status = :status', {
        status: 'active',
      })
      .select(['category.categoryId', 'category.name', 'category.description'])
      .distinct(true)
      .orderBy('category.categoryId', 'ASC')
      .getMany();
  }

  async findProducts(query: GetStoreProductsDto) {
    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;
    const filter = { q: query.q?.trim(), categoryId: query.categoryId };

    const listQuery = this.products
      .createQueryBuilder('product')
      .innerJoin('product.category', 'category')
      .leftJoin('product.variants', 'variant')
      .leftJoin(
        'product.images',
        'primaryImage',
        'primaryImage.isPrimary = :isPrimary',
        { isPrimary: true },
      )
      .select('product.productId', 'productId')
      .addSelect('product.name', 'name')
      .addSelect('product.description', 'description')
      .addSelect('product.brand', 'brand')
      .addSelect('category.categoryId', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('MIN(variant.price)', 'priceFrom')
      .addSelect('MAX(primaryImage.imageUrl)', 'primaryImageUrl')
      .where('product.status = :status', { status: 'active' })
      .groupBy('product.productId')
      .addGroupBy('category.categoryId')
      .addGroupBy('category.name')
      .orderBy('product.productId', 'ASC')
      .offset(offset)
      .limit(limit);

    const countQuery = this.products
      .createQueryBuilder('product')
      .where('product.status = :status', { status: 'active' });

    this.applyFilters(listQuery, filter);
    this.applyFilters(countQuery, filter);

    const [rows, total] = await Promise.all([
      listQuery.getRawMany<StoreProductRow>(),
      countQuery.getCount(),
    ]);

    const items: StoreProductSummary[] = rows.map((row) => ({
      productId: Number(row.productId),
      name: row.name,
      description: row.description,
      brand: row.brand,
      category: {
        categoryId: Number(row.categoryId),
        name: row.categoryName,
      },
      priceFrom: row.priceFrom,
      primaryImageUrl: row.primaryImageUrl,
    }));

    return { items, page, limit, total };
  }

  async findProduct(productId: number) {
    if (
      !Number.isSafeInteger(productId) ||
      productId < 1 ||
      productId > 2_147_483_647
    ) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    const product = await this.products.findOne({
      where: { productId, status: 'active' },
      relations: { category: true, variants: true, images: true },
      order: {
        variants: { variantId: 'ASC' },
        images: { sortOrder: 'ASC', productImageId: 'ASC' },
      },
    });

    if (!product) {
      throw new NotFoundException('Không tìm thấy sản phẩm.');
    }

    return {
      productId: product.productId,
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: {
        categoryId: product.category.categoryId,
        name: product.category.name,
        description: product.category.description,
      },
      variants: product.variants.map((variant) => ({
        variantId: variant.variantId,
        size: variant.size,
        color: variant.color,
        price: variant.price,
      })),
      images: product.images.map((image) => ({
        productImageId: image.productImageId,
        imageUrl: image.imageUrl,
        altText: image.altText,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
      })),
    };
  }

  private applyFilters(
    query: SelectQueryBuilder<Product>,
    filter: { q: string | undefined; categoryId: number | undefined },
  ): void {
    if (filter.q) {
      const searchTerm = `%${filter.q}%`;
      query.andWhere(
        '(product.name ILIKE :searchTerm OR product.brand ILIKE :searchTerm OR product.description ILIKE :searchTerm)',
        { searchTerm },
      );
    }

    if (filter.categoryId !== undefined) {
      query.andWhere('product.categoryId = :categoryId', {
        categoryId: filter.categoryId,
      });
    }
  }
}
