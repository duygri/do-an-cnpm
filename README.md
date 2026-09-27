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

Backend dùng NestJS, TypeScript, PostgreSQL và TypeORM. Đã có migration catalog/nhân viên, đăng nhập JWT và CRUD danh mục, sản phẩm, biến thể có bảo vệ token. Xem [hướng dẫn backend](backend/README.md).
