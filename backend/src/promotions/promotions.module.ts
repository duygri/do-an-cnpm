import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SalesOrder } from '../orders/entities/sales-order.entity';
import { PromotionDetail } from './entities/promotion-detail.entity';
import { Promotion } from './entities/promotion.entity';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Promotion, PromotionDetail, SalesOrder]),
  ],
  controllers: [PromotionsController],
  providers: [PromotionsService],
})
export class PromotionsModule {}
