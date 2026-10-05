import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductVariantsController } from './product-variants.controller';
import { ProductVariantsService } from './product-variants.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { ProductImage } from './entities/product-image.entity';
import { ProductVariant } from './entities/product-variant.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Category, Product, ProductImage, ProductVariant]),
  ],
  controllers: [
    CategoriesController,
    ProductsController,
    ProductVariantsController,
    StorefrontController,
  ],
  providers: [
    CategoriesService,
    ProductsService,
    ProductVariantsService,
    StorefrontService,
  ],
})
export class CatalogModule {}
