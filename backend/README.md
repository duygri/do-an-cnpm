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
3. Chạy migration để tạo schema danh mục, sản phẩm, biến thể, nhân viên, nhà cung cấp, phiếu nhập và sổ biến động tồn kho:

```powershell
npm run db:migrate
```

Xem trạng thái các migration:

```powershell
npm run db:migrations
```

Ứng dụng không tự thay đổi schema khi khởi động (`synchronize: false`); mọi thay đổi cấu trúc phải đi qua migration.

## Đăng nhập nhân viên

1. Đặt `JWT_SECRET` thành chuỗi ngẫu nhiên riêng, tối thiểu 32 byte, trong `.env`.
2. Chạy migration và tạo nhân viên quản trị đầu tiên:

```powershell
npm run db:migrate
npm run db:create-admin
```

3. Đăng nhập bằng `POST /auth/employee/login` với JSON gồm `email` và `password`. API trả JWT Bearer có thời hạn 15 phút; gửi token ở `Authorization: Bearer <token>` khi gọi `GET /auth/employee/profile`.

API không có đăng ký admin công khai. Nhân viên bị khóa (`status` khác `active`) không đăng nhập hoặc dùng token hiện có được.

## Tài khoản khách hàng

Khách có thể tạo tài khoản và đăng nhập bằng `POST /auth/customer/register` và `POST /auth/customer/login`. Cả hai nhận `email` và `password`; đăng ký cần thêm `name`, mật khẩu dài 12–128 ký tự. `dateOfBirth` (`YYYY-MM-DD`), `phone`, `address`, và `gender` là tùy chọn. Email được cắt khoảng trắng và chuyển thành chữ thường.

Phản hồi đăng nhập/đăng ký có `access_token`, `token_type`, `expires_in` và `customer` với các trường `customerId`, `name`, `email`, `dateOfBirth`, `phone`, `address`, `gender`. Gửi token ở header `Authorization: Bearer <token>` để gọi `GET /auth/customer/profile` hoặc `PATCH /auth/customer/profile`. PATCH chỉ nhận `name`, `dateOfBirth`, `phone`, `address`, `gender`; bỏ qua trường để giữ nguyên, gửi `null` để xóa trường cho phép null. Email và mật khẩu không cập nhật qua API hồ sơ.

JWT có phân biệt loại chủ thể. Customer token không truy cập được các API quản trị; token nhân viên cũ chưa có claim loại chủ thể vẫn được nhận đến khi hết hạn 15 phút hiện tại.

## API danh mục

Các endpoint dưới đây đều yêu cầu JWT của nhân viên trong header `Authorization: Bearer <token>`:

- `GET /categories`: danh sách danh mục.
- `GET /categories/:categoryId`: chi tiết danh mục.
- `POST /categories`: tạo danh mục với `name` và tùy chọn `description`.
- `PATCH /categories/:categoryId`: cập nhật `name` hoặc `description`.
- `DELETE /categories/:categoryId`: xóa danh mục; trả `409` nếu sản phẩm đang tham chiếu danh mục.

## API sản phẩm và biến thể

Các endpoint này cũng yêu cầu JWT nhân viên:

- `GET /products` và `GET /products/:productId`: danh sách hoặc chi tiết sản phẩm.
- `POST /products`: tạo sản phẩm với `name`, `categoryId` và các trường tùy chọn `description`, `brand`, `status`.
- `PATCH /products/:productId` và `DELETE /products/:productId`: cập nhật hoặc xóa sản phẩm. Xóa bị từ chối nếu còn biến thể.
- `GET /products/:productId/variants`: liệt kê biến thể.
- `POST /products/:productId/variants`: thêm biến thể với `price` và tùy chọn `size`, `color`.
- `PATCH /products/:productId/variants/:variantId` và `DELETE /products/:productId/variants/:variantId`: cập nhật hoặc xóa biến thể thuộc sản phẩm đó.

## API storefront công khai

Các route này không yêu cầu đăng nhập và chỉ đọc dữ liệu dành cho storefront:

- `GET /store/categories`: danh mục có ít nhất một sản phẩm `active`.
- `GET /store/products?page=1&limit=20&q=shirt&categoryId=1`: lọc theo từ khóa tên/nhãn hiệu/mô tả (không phân biệt hoa thường), danh mục và phân trang. Mặc định `page=1`, `limit=20`; giới hạn tối đa 100. Phản hồi có `items`, `page`, `limit`, `total`. Mỗi item gồm thông tin sản phẩm, danh mục và `priceFrom` là giá biến thể thấp nhất.
- `GET /store/products/:productId`: chi tiết sản phẩm `active`, danh mục và các biến thể theo thứ tự ID.

Schema biến thể hiện chưa có trạng thái riêng, vì vậy tất cả biến thể của sản phẩm đang `active` đều xuất hiện và được tính trong `priceFrom`. Sản phẩm không hoạt động hoặc không tồn tại trả `404`. API này không trả số tồn kho; đặt hàng và trừ kho sẽ được bổ sung ở giai đoạn tiếp theo.

## API nhà cung cấp

Các endpoint đều yêu cầu JWT nhân viên:

- `GET /suppliers` và `GET /suppliers/:supplierId`: danh sách hoặc chi tiết.
- `POST /suppliers`: tạo với `name` và tùy chọn `address`, `email`.
- `PATCH /suppliers/:supplierId`: cập nhật một hoặc nhiều trường trên.
- `DELETE /suppliers/:supplierId`: xóa nhà cung cấp; trả `409` nếu đã có phiếu nhập tham chiếu.

## API phiếu nhập

Các endpoint đều yêu cầu JWT nhân viên:

- `GET /imports` và `GET /imports/:importId`: danh sách hoặc chi tiết phiếu nhập.
- `POST /imports`: tạo phiếu với `supplierId`, tùy chọn `note`, và 1–100 dòng `details`. Mỗi dòng có `variantId`, `quantity` nguyên dương và `unitPrice` dạng chuỗi thập phân tối đa hai chữ số, ví dụ:

```json
{
  "supplierId": 1,
  "note": "Nhập hàng đầu tháng",
  "details": [{ "variantId": 1, "quantity": 10, "unitPrice": "12500.00" }]
}
```

API lấy `employeeId` từ JWT, tính subtotal/tổng tiền phía server, rồi lưu phiếu, chi tiết và biến động nhập kho trong cùng transaction. Không thể sửa/xóa phiếu nhập; muốn hiệu chỉnh tồn phải ghi biến động điều chỉnh.

## API tồn kho

Các endpoint đều yêu cầu JWT nhân viên. Số lượng được tính từ sổ `inventory_movement`, không lưu một số tồn có thể lệch khỏi lịch sử.

- `POST /inventory/opening-balances`: tạo lô tồn đầu kỳ ban đầu với `rows` gồm `{ "variantId": 1, "quantity": 20 }`. Mỗi biến thể chỉ được đặt một lần và phải đặt trước biến động kho đầu tiên. Có thể đặt số lượng `0`; cả lô được lưu toàn bộ hoặc không lưu.
- `POST /inventory/adjustments`: ghi điều chỉnh kiểm kê, ví dụ `{ "variantId": 1, "direction": "out", "quantity": 1, "note": "Chênh lệch kiểm kê" }`. Điều chỉnh xuất không được làm tồn âm.
- `GET /inventory/variants/:variantId/balance?from=2026-09-01&to=2026-10-01`: trả `beginningBalance`, `inbound`, `outbound`, `endingBalance`. Ngày tính theo UTC; `from` được tính, `to` là mốc kết thúc không bao gồm.

`endingBalance = beginningBalance + inbound - outbound`. Phiếu nhập tạo biến động nhập. Đơn chờ xử lý hoặc bị hủy không trừ tồn; phần API đơn hàng sau này sẽ ghi biến động xuất khi đơn thực sự được giao/xuất.

## Lệnh hữu ích

- `npm run build`: biên dịch TypeScript vào `dist/`
- `npm run lint`: kiểm tra quy tắc lint
- `npm run format`: định dạng mã nguồn trong `src/`
- `npm run start:dev`: chạy API ở chế độ theo dõi thay đổi

## Mã nguồn

- `src/main.ts`: khởi động ứng dụng NestJS.
- `src/app.module.ts`: cấu hình module gốc và kết nối PostgreSQL.
- `src/catalog/entities/`: entity danh mục, sản phẩm và biến thể.
- `src/catalog/storefront.*`: API đọc danh mục và sản phẩm công khai.
- `src/customers/`: tài khoản khách hàng, hồ sơ và xác thực JWT riêng.
- `src/suppliers/`, `src/imports/`, `src/inventory/`: quản lý nhà cung cấp, phiếu nhập và sổ tồn kho.
- `src/employees/entities/`: entity nhân viên dùng cho đăng nhập.
- `src/auth/`: đăng nhập JWT, xác minh bearer token và băm mật khẩu.
- `src/database/data-source.ts`: cấu hình TypeORM CLI.
- `src/database/migrations/`: migration schema.
- `src/app.controller.ts` và `src/app.service.ts`: endpoint khởi tạo.
