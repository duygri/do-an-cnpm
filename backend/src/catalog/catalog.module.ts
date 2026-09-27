import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { ProductVariant } from './entities/product-variant.entity';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Category, Product, ProductVariant]),
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CatalogModule {}
