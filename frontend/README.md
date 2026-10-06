# Frontend

Yêu cầu Node.js `^22.13.0 || ^24.0.0 || >=26.0.0` và npm đi kèm Node.js.

Chạy các lệnh sau trong thư mục `frontend/`:

```sh
npm ci
npm run dev:portals
```

Khởi động NestJS API tại `http://localhost:3000` theo [hướng dẫn backend](../backend/README.md). Các cổng Vite chuyển tiếp yêu cầu API tới địa chỉ này.

| Cổng | Chạy riêng | URL trình duyệt |
| --- | --- | --- |
| User | `npm run dev:user` (hoặc `npm run dev`) | http://localhost:5173 |
| Management | `npm run dev:admin` | http://localhost:5175 — nhân viên: `/admin/employees` |

Management dùng chung một portal cho `admin` và `manager`. `manager` thấy các module vận hành; `admin` có thêm quản lý nhân viên. Frontend chỉ ẩn/khóa điều hướng theo vai trò; backend vẫn là nơi quyết định quyền truy cập.

`admin` còn có mục **Thống kê doanh thu** tại `http://localhost:5175/admin/revenue`. Trang gọi `GET /admin/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD`; mặc định là tháng lịch hiện tại theo múi giờ `Asia/Ho_Chi_Minh`. Báo cáo chỉ tính đơn đã thanh toán, chưa bị hủy, theo `paymentConfirmedAt` ở Việt Nam. Chỉ tiêu là tổng `totalAmount` sau giảm giá và gồm phí giao hàng; đây là báo cáo vận hành MVP nội bộ, không phải hóa đơn thuế hoặc báo cáo kế toán. `manager` không thấy mục này và không được backend cấp quyền API.

Cổng đã được sử dụng sẽ khiến lệnh khởi động thất bại; Vite không tự đổi sang cổng khác. Dừng cả hai bằng `Ctrl+C` khi chạy `dev:portals`.

## Kiểm tra và build

```sh
npm test -- --run
npm run test:smoke
npm run build
```

Smoke test dùng API giả cục bộ và các cổng tạm thời để kiểm tra HTML, đường dẫn sâu, bootstrap, proxy JSON và xung đột cổng; không cần NestJS hay cơ sở dữ liệu. Test này không kiểm tra thao tác trong trình duyệt hoặc API thật.

Build riêng: `npm run build:user`, `npm run build:admin`. Kết quả nằm trong `dist/user` và `dist/admin`.
