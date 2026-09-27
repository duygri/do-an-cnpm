# Backend — NestJS

API của hệ thống bán hàng, viết bằng TypeScript với NestJS 11.

## Yêu cầu

- Node.js 20.11 trở lên
- npm

## Chạy local

```powershell
npm install
npm run start:dev
```

Mặc định API chạy tại http://localhost:3000.

## Lệnh hữu ích

- `npm run build`: biên dịch TypeScript vào `dist/`
- `npm run lint`: kiểm tra quy tắc lint
- `npm run format`: định dạng mã nguồn trong `src/`

## Mã nguồn

- `src/main.ts`: khởi động ứng dụng NestJS.
- `src/app.module.ts`: module gốc.
- `src/app.controller.ts` và `src/app.service.ts`: endpoint khởi tạo.

Kết nối database và các module nghiệp vụ sẽ được bổ sung theo ERD ở các bước tiếp theo.
