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
| Staff | `npm run dev:staff` | http://localhost:5174 — đơn hàng: `/staff/orders` |
| Admin | `npm run dev:admin` | http://localhost:5175 — nhân viên: `/admin/employees` |

Cổng đã được sử dụng sẽ khiến lệnh khởi động thất bại; Vite không tự đổi sang cổng khác. Dừng cả ba bằng `Ctrl+C` khi chạy `dev:portals`.

## Kiểm tra và build

```sh
npm test -- --run
npm run test:smoke
npm run build
```

Smoke test dùng API giả cục bộ và các cổng tạm thời để kiểm tra HTML, đường dẫn sâu, bootstrap, proxy JSON và xung đột cổng; không cần NestJS hay cơ sở dữ liệu. Test này không kiểm tra thao tác trong trình duyệt hoặc API thật.

Build riêng: `npm run build:user`, `npm run build:staff`, `npm run build:admin`. Kết quả nằm trong `dist/user`, `dist/staff`, `dist/admin`.
