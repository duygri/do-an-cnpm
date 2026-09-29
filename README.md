# Hệ thống bán hàng

Khung dự án website bán hàng dựa trên ERD do nhóm cung cấp.

## Cấu trúc

- `frontend/`: giao diện người dùng.
- `backend/`: API dùng TypeScript + NestJS 11.
- `database/`: dữ liệu mẫu dùng chung.
- `backend/src/database/migrations/`: migration PostgreSQL do TypeORM quản lý.
- `docs/erd/`: sơ đồ ERD và tài liệu dữ liệu.

## Tài liệu

- [ERD gốc do nhóm cung cấp](docs/erd/sales-system-erd.png)
- [ERD đã chỉnh sửa, dạng Mermaid](docs/erd/sales-system-erd.md)
- [Hướng dẫn backend](backend/README.md)

## Trạng thái

Backend dùng NestJS, TypeScript, PostgreSQL và TypeORM. Đã có migration catalog/nhân viên/khách hàng/nhập hàng, đăng nhập JWT phân biệt nhân viên và khách, CRUD danh mục/sản phẩm/biến thể/nhà cung cấp, storefront công khai, phiếu nhập ghi lại lịch sử nhập hàng từ nhà cung cấp và xác nhận thanh toán COD do nhân viên thực hiện sau khi đóng gói. Hệ thống không theo dõi tồn kho: số lượng trên phiếu nhập và đơn hàng chỉ là dữ liệu chứng từ, không được dùng để tính số hàng khả dụng. Xem [hướng dẫn backend](backend/README.md).
