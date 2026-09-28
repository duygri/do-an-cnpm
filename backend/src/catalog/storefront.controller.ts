import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { GetStoreProductsDto } from './dto/get-store-products.dto';
import { StorefrontService } from './storefront.service';

@Controller('store')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('categories')
  findCategories() {
    return this.storefront.findCategories();
  }

  @Get('products')
  findProducts(@Query() query: GetStoreProductsDto) {
    return this.storefront.findProducts(query);
  }

  @Get('products/:productId')
  findProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.storefront.findProduct(productId);
  }
}
