import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { ImportDetail } from './entities/import-detail.entity';
import { StockImport } from './entities/stock-import.entity';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Supplier, StockImport, ImportDetail]),
  ],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
