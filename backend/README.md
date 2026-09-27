# Backend — NestJS

API của hệ thống bán hàng, viết bằng TypeScript với NestJS 11.

## Yêu cầu

- Node.js 20.19+, 22.13+ hoặc 24.11+
- npm
- PostgreSQL

## Chạy local

```powershell
npm install
npm run start:dev
```

Sau khi đã cấu hình database, API chạy tại http://localhost:3000.

## Database

1. Tạo database PostgreSQL tên `sales_system`.
2. Sao chép `.env.example` thành `.env` và cập nhật `DATABASE_URL` bằng thông tin PostgreSQL local của bạn.
3. Chạy migration đầu tiên để tạo `category`, `product` và `product_variant`:

```powershell
npm run db:migrate
```

Xem trạng thái các migration:

```powershell
npm run db:migrations
```

Ứng dụng không tự thay đổi schema khi khởi động (`synchronize: false`); mọi thay đổi cấu trúc phải đi qua migration.

## Lệnh hữu ích

- `npm run build`: biên dịch TypeScript vào `dist/`
- `npm run lint`: kiểm tra quy tắc lint
- `npm run format`: định dạng mã nguồn trong `src/`
- `npm run start:dev`: chạy API ở chế độ theo dõi thay đổi

## Mã nguồn

- `src/main.ts`: khởi động ứng dụng NestJS.
- `src/app.module.ts`: cấu hình module gốc và kết nối PostgreSQL.
- `src/catalog/entities/`: entity danh mục, sản phẩm và biến thể.
- `src/database/data-source.ts`: cấu hình TypeORM CLI.
- `src/database/migrations/`: migration schema.
- `src/app.controller.ts` và `src/app.service.ts`: endpoint khởi tạo.
