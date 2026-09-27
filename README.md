# Hệ thống bán hàng

Khung dự án website bán hàng dựa trên ERD do nhóm cung cấp.

## Cấu trúc

- `frontend/`: giao diện người dùng.
- `backend/`: API dùng TypeScript + NestJS 11.
- `database/`: dữ liệu mẫu dùng chung.
- `backend/src/database/migrations/`: migration PostgreSQL do TypeORM quản lý.
- `docs/erd/`: sơ đồ ERD và tài liệu dữ liệu.

## Tài liệu

- [ERD hệ thống bán hàng](docs/erd/sales-system-erd.png)
- [Hướng dẫn backend](backend/README.md)

## Trạng thái

Backend dùng NestJS, TypeScript, PostgreSQL và TypeORM. Migration đầu tiên tạo danh mục, sản phẩm và biến thể; xem [hướng dẫn cấu hình database](backend/README.md#database).
