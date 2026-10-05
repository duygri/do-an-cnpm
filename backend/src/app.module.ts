import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CustomersModule } from './customers/customers.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ImportsModule } from './imports/imports.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { OrdersModule } from './orders/orders.module';
import { PromotionsModule } from './promotions/promotions.module';
import { PayosPaymentModule } from './payments/payos-payment.module';
import { EmployeesModule } from './employees/employees.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: configService.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        migrationsRun: false,
        migrations: [join(__dirname, 'database', 'migrations', '*{.ts,.js}')],
      }),
    }),
    CatalogModule,
    AuthModule,
    CustomersModule,
    SuppliersModule,
    ImportsModule,
    OrdersModule,
    PromotionsModule,
    PayosPaymentModule,
    EmployeesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
