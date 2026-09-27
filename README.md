# Hệ thống bán hàng

Khung dự án website bán hàng dựa trên ERD do nhóm cung cấp.

## Cấu trúc

- `frontend/`: giao diện người dùng.
- `backend/`: API dùng TypeScript + NestJS 11.
- `database/`: migration và dữ liệu mẫu.
- `docs/erd/`: sơ đồ ERD và tài liệu dữ liệu.

## Tài liệu

- [ERD hệ thống bán hàng](docs/erd/sales-system-erd.png)
- [Hướng dẫn backend](backend/README.md)

## Trạng thái

Backend đã có scaffold NestJS. Database và ORM sẽ được chốt trước khi xây các module sản phẩm, tồn kho và đơn hàng.
