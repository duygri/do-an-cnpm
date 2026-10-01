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
3. Chạy migration để tạo schema danh mục, sản phẩm, biến thể, khách hàng, đơn hàng, nhân viên, nhà cung cấp và phiếu nhập:

```powershell
npm run db:migrate
```

Xem trạng thái các migration:

```powershell
npm run db:migrations
```

Ứng dụng không tự thay đổi schema khi khởi động (`synchronize: false`); mọi thay đổi cấu trúc phải đi qua migration.

Migration `1790720000000-remove-inventory-ledger` xóa bảng `inventory_movement` và toàn bộ dòng ledger hiện có. Rollback chỉ phục hồi cấu trúc ledger từ các migration lịch sử dưới dạng bảng rỗng; các dòng đã xóa không thể khôi phục.

PayOS là tùy chọn. Để tạo đơn thanh toán PayOS có số tiền lớn hơn 0, điền đủ `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_RETURN_URL` và `PAYOS_CANCEL_URL` trong `.env`. URL return/cancel chỉ dùng để chuyển hướng trình duyệt sau khi khách rời trang PayOS; chúng không xác nhận thanh toán. Webhook của API phải truy cập công khai qua HTTPS tại `/payments/payos/webhook`. Khi chạy local, dùng một HTTPS tunnel trỏ vào cổng API (ví dụ ngrok hoặc Cloudflare Tunnel) và cấu hình URL tunnel làm webhook/callback trong môi trường PayOS. Không đưa secret PayOS vào mã nguồn hoặc Git.

## Đăng nhập nhân viên

1. Đặt `JWT_SECRET` thành chuỗi ngẫu nhiên riêng, tối thiểu 32 byte, trong `.env`.
2. Chạy migration và tạo nhân viên quản trị đầu tiên:

```powershell
npm run db:migrate
npm run db:create-admin
```

Migration gán role `admin` cho nhân viên cũ có `LOWER(TRIM(position)) = 'admin'`; các nhân viên cũ khác nhận `unassigned`. Lệnh `db:create-admin` tạo tài khoản active với cả `position = 'admin'` và role `admin`. Tài khoản nhân viên mới sau đó được admin tạo qua API quản lý nhân viên.

3. Đăng nhập bằng `POST /auth/employee/login` với JSON gồm `email` và `password`. API trả JWT Bearer có thời hạn 15 phút cùng hồ sơ `employee` gồm `employeeId`, `name`, `email`, `position`, `role`; gửi token ở `Authorization: Bearer <token>` khi gọi `GET /auth/employee/profile` để đọc lại role hiện tại.

API không có đăng ký admin công khai. Nhân viên bị khóa (`status` khác `active`) không đăng nhập hoặc dùng token hiện có được. Nhân viên active ở mọi role, kể cả `unassigned`, có thể đăng nhập và xem hồ sơ của chính mình.

## Tài khoản khách hàng

Khách có thể tạo tài khoản và đăng nhập bằng `POST /auth/customer/register` và `POST /auth/customer/login`. Cả hai nhận `email` và `password`; đăng ký cần thêm `name`, mật khẩu dài 12–128 ký tự. `dateOfBirth` (`YYYY-MM-DD`), `phone`, `address`, và `gender` là tùy chọn. Email được cắt khoảng trắng và chuyển thành chữ thường.

Phản hồi đăng nhập/đăng ký có `access_token`, `token_type`, `expires_in` và `customer` với các trường `customerId`, `name`, `email`, `dateOfBirth`, `phone`, `address`, `gender`. Gửi token ở header `Authorization: Bearer <token>` để gọi `GET /auth/customer/profile` hoặc `PATCH /auth/customer/profile`. PATCH chỉ nhận `name`, `dateOfBirth`, `phone`, `address`, `gender`; bỏ qua trường để giữ nguyên, gửi `null` để xóa trường cho phép null. Email và mật khẩu không cập nhật qua API hồ sơ.

JWT có phân biệt loại chủ thể. Customer token không truy cập được các API nhân viên; employee token không truy cập được các API customer. Token nhân viên cũ chưa có claim loại chủ thể vẫn được nhận đến khi hết hạn 15 phút hiện tại. Role được đọc từ PostgreSQL ở mỗi request, không lấy từ JWT claim; thay đổi role có hiệu lực ở request tiếp theo. Token thiếu/sai/hết hạn, sai actor hoặc nhân viên inactive trả `401 Unauthorized`. Employee token hợp lệ của nhân viên active nhưng thiếu role của route trả `403 Forbidden`.

### Vai trò nhân viên và API quản lý nhân viên

| Role | Quyền API |
| --- | --- |
| `admin` | Toàn bộ API nhân viên và mọi module bên dưới, gồm quản lý nhân viên. |
| `catalog_manager` | `/categories`, `/products` và `/products/:productId/variants` (kèm route chi tiết). |
| `promotion_manager` | `/promotions` và `/promotions/:promotionId/vouchers` (kèm route chi tiết). |
| `order_staff` | `/admin/orders`, đóng gói, xác nhận COD và `/admin/orders/:orderId/invoice`. |
| `purchasing_staff` | `/suppliers` và `/imports`. |
| `unassigned` | Chỉ `/auth/employee/profile`; không được gọi API quản trị nghiệp vụ cho đến khi admin gán role. |

`position` là chức danh mô tả, không cấp quyền. Role được kiểm tra trên server qua employee-role guard; admin mặc nhiên được phép ở mọi API có yêu cầu role nhân viên. Nhân viên có thể đăng nhập nhưng chưa được gán quyền module vẫn chỉ xem được profile.

Các route quản trị nhân viên chỉ dành cho role `admin`:

- `GET /admin/employees?page=1&limit=20`: danh sách theo `employeeId` tăng dần, phân trang với `page` mặc định 1 (tối đa 2,147,483,647), `limit` mặc định 20 (tối đa 100). Phản hồi `{ items, page, limit, total }`; mỗi item chỉ có `employeeId`, `name`, `email`, `phone`, `position`, `role`, `status`.
- `POST /admin/employees`: tạo nhân viên với `name`, email hợp lệ, mật khẩu 12–128 ký tự, `position` và role tường minh; `phone` tùy chọn. Email được trim/lowercase, mật khẩu được hash bằng password service hiện có, tài khoản mới có `status: active`. Response chỉ gồm projection an toàn như trên; email trùng sau chuẩn hóa trả `409`.
- `PATCH /admin/employees/:employeeId`: cập nhật `role` và/hoặc `status` (`active`/`inactive`); body phải có ít nhất một trong hai trường. Không xóa hồ sơ hay sửa password qua route này. Không thể tự hạ quyền/tự khóa tài khoản hoặc hạ quyền/khóa quản trị viên active cuối cùng; các thay đổi này được kiểm tra và ghi trong cùng transaction. Response không chứa `passwordHash`.

## API danh mục

Các endpoint dưới đây yêu cầu JWT nhân viên active có role `catalog_manager` hoặc `admin` trong header `Authorization: Bearer <token>`:

- `GET /categories`: danh sách danh mục.
- `GET /categories/:categoryId`: chi tiết danh mục.
- `POST /categories`: tạo danh mục với `name` và tùy chọn `description`.
- `PATCH /categories/:categoryId`: cập nhật `name` hoặc `description`.
- `DELETE /categories/:categoryId`: xóa danh mục; trả `409` nếu sản phẩm đang tham chiếu danh mục.

## API sản phẩm và biến thể

Các endpoint này cũng yêu cầu JWT nhân viên active có role `catalog_manager` hoặc `admin`:

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

Schema biến thể hiện chưa có trạng thái riêng, vì vậy tất cả biến thể của sản phẩm đang `active` đều xuất hiện và được tính trong `priceFrom`. Sản phẩm không hoạt động hoặc không tồn tại trả `404`. API storefront không trả số tồn kho. Hệ thống không theo dõi số lượng hàng khả dụng; API đặt hàng chỉ kiểm tra sản phẩm đang hoạt động và biến thể hợp lệ.

## API chương trình khuyến mãi và voucher

Các route quản lý dưới đây yêu cầu JWT của nhân viên active có role `promotion_manager` hoặc `admin` trong header `Authorization: Bearer <token>`. Employee hợp lệ nhưng thiếu role trả `403 Forbidden`; lỗi xác thực hoặc nhân viên không còn active trả `401 Unauthorized`.

- `GET /promotions` và `GET /promotions/:promotionId`: liệt kê hoặc xem chương trình theo `promotionId` tăng dần. Phản hồi có `promotionId`, `name`, `description`, `startDate`, `endDate`, `status`.
- `POST /promotions`: tạo chương trình với `name`, `startDate`, `endDate`; `description` và `status` là tùy chọn. Ví dụ: `{ "name": "Tết 2027", "description": "Khuyến mãi Tết", "startDate": "2027-01-01", "endDate": "2027-02-28", "status": "active" }`.
- `PATCH /promotions/:promotionId`: cập nhật một hoặc nhiều trường `name`, `description`, `startDate`, `endDate`, `status`. Chỉ cập nhật các trường được gửi; `description: null` xóa mô tả. Body rỗng bị từ chối.
- `GET /promotions/:promotionId/vouchers` và `GET /promotions/:promotionId/vouchers/:voucherId`: liệt kê voucher theo `voucherId` tăng dần hoặc xem một voucher thuộc chương trình. Phản hồi có `voucherId`, `promotionId`, `code`, `name`, `type`, `discountValue`, `startDate`, `endDate`, `minPrice`, `maxDiscount`, `quantity`, `status`.
- `POST /promotions/:promotionId/vouchers`: tạo voucher với `code`, `name`, `type`, `discountValue`, `startDate`, `endDate`, `minPrice`, `quantity`; `maxDiscount` và `status` là tùy chọn. Ví dụ:

```json
{
  "code": "tet10",
  "name": "Giảm 10%",
  "type": "percentage",
  "discountValue": "10.00",
  "startDate": "2027-01-05",
  "endDate": "2027-02-20",
  "minPrice": "500000.00",
  "maxDiscount": "100000.00",
  "quantity": 100,
  "status": "active"
}
```

- `PATCH /promotions/:promotionId/vouchers/:voucherId`: cập nhật một hoặc nhiều trường `name`, `type`, `discountValue`, `startDate`, `endDate`, `minPrice`, `maxDiscount`, `quantity`, `status`. `code` không thể sửa; body rỗng bị từ chối. Gửi `maxDiscount: null` để bỏ mức trần.

Tên chương trình/voucher dài tối đa 120 ký tự; mô tả chương trình tùy chọn, tối đa 5000 ký tự. Ngày dùng định dạng `YYYY-MM-DD`, ngày bắt đầu không sau ngày kết thúc. `status` nhận `active` hoặc `inactive` và mặc định là `active`. Mỗi campaign và voucher có khoảng ngày riêng; cả hai khoảng đều phải chứa ngày hiện tại (tính cả hai đầu mút) thì voucher mới dùng được.

Mã voucher khi tạo hoặc gửi cùng đơn hàng được cắt khoảng trắng hai đầu, chuẩn hóa thành chữ hoa và chỉ nhận chữ ASCII, số, dấu gạch ngang hoặc gạch dưới; độ dài 1–64 ký tự. Mã duy nhất trên toàn hệ thống và không đổi sau khi tạo. `type` nhận `fixed` hoặc `percentage`. Các giá trị tiền `discountValue`, `minPrice` và `maxDiscount` phải vừa `numeric(24,2)` (tối đa 22 chữ số phần nguyên và 2 chữ số phần thập phân). `discountValue` phải dương; tỷ lệ phần trăm không vượt quá `100.00`. `minPrice` không âm; `maxDiscount` dương, tùy chọn và chỉ dùng với voucher phần trăm. `quantity` là số nguyên từ 1 đến `2,147,483,647`, giới hạn tổng lượt dùng trên tất cả khách hàng.

Input sai, ngày không hợp lệ hoặc khoảng ngày đảo ngược trả `400 Bad Request`. Không tìm thấy campaign/voucher, hoặc voucher không thuộc campaign trên URL, trả `404 Not Found`. Mã trùng sau chuẩn hóa hoặc giảm `quantity` thấp hơn số lượt hiện đang được giữ sẽ trả `409 Conflict`. Không có route `DELETE`; ngừng áp dụng bằng cách cập nhật `status` sang `inactive`. Campaign/voucher và mã vẫn được giữ để giải thích các đơn hàng cũ.

## API đơn hàng khách hàng

Tất cả route đơn hàng yêu cầu customer JWT trong header `Authorization: Bearer <token>`. Khách chỉ xem hoặc hủy đơn của chính mình; đơn không tồn tại hoặc thuộc khách khác trả `404`.

- `POST /orders`: tạo đơn với 1–100 biến thể khác nhau, số lượng nguyên dương, cùng thông tin giao hàng bắt buộc `recipientName`, `recipientPhone`, `shippingAddress`; `note`, `voucherCode` và `paymentMethod` là tùy chọn. `paymentMethod` nhận `cod` hoặc `payos`, mặc định `cod`. Tên người nhận tối đa 120 ký tự, điện thoại tối đa 30 ký tự; các chuỗi được cắt khoảng trắng và địa chỉ phải còn nội dung sau khi cắt. Ví dụ:

```json
{
  "recipientName": "Nguyen Van An",
  "recipientPhone": "0901234567",
  "shippingAddress": "12 Nguyen Hue, Quan 1, TP. Ho Chi Minh",
  "note": "Gọi trước khi giao",
  "voucherCode": "TET10",
  "details": [
    { "variantId": 1, "quantity": 2 },
    { "variantId": 3, "quantity": 1 }
  ]
}
```

Khi chọn `paymentMethod: "payos"`, gửi thêm header `Idempotency-Key` dài 1–255 ký tự, chỉ gồm chữ ASCII, số và `. _ ~ : -`. Cùng khách hàng, cùng key và cùng nội dung đơn trả lại đơn đã tạo; dùng lại key với nội dung khác trả `409 Conflict`. Gửi lại đúng request cùng key để tiếp tục một lần tạo link chưa xác định; không tự tạo đơn mới hoặc đổi key trong khi trạng thái cũ đang được rà soát. COD không yêu cầu key và hiện giữ luồng tạo đơn cũ.

Server lấy khách hàng từ JWT, kiểm tra sản phẩm còn hoạt động và biến thể hợp lệ, rồi tính giá từng dòng và tổng tiền. Số lượng đặt không được đối chiếu với số hàng khả dụng, vì hệ thống không theo dõi tồn kho. `voucherCode` là tùy chọn; nếu gửi, khách chỉ áp dụng được một mã. `paymentMethod` cũng tùy chọn và chỉ nhận `cod` hoặc `payos`; mặc định là `cod`. Khách chọn phương thức này nhưng không thể gửi/ghi đè giá, tổng tiền, giảm giá, phí giao hàng, trạng thái thanh toán hay trạng thái đơn. Không dùng voucher thì đơn mới có `voucherId: null`, `voucherCode: null`, `discountAmount: "0.00"`; mọi đơn mới có `shippingFee: "0.00"` và `status: "pending"`. Đơn COD bắt đầu `paymentStatus: "unpaid"`; đơn PayOS có tổng bằng 0 được đánh dấu `paid` ngay, còn đơn PayOS có tổng lớn hơn 0 bắt đầu `unpaid` và tạo payment attempt. Tạo đơn, chi tiết và payment attempt được ghi nguyên tử. Phản hồi tạo đơn gồm `orderId`, `orderDate`, `customerId`, `voucherId`, `voucherCode`, `recipientName`, `recipientPhone`, `shippingAddress`, `discountAmount`, `shippingFee`, `totalAmount`, `paymentMethod`, `paymentStatus`, `status`, `note` và `details` (mỗi dòng có `orderId`, `variantId`, `quantity`, `unitPrice`, `subtotal`). Với đơn PayOS đang chờ và có URL đã lưu, phản hồi chi tiết khách còn có `checkoutUrl` và `paymentExpiresAt`; các trường thanh toán nội bộ không được trả. `voucherId` và `voucherCode` là `null` khi không dùng voucher.

- `GET /orders?page=1&limit=20`: liệt kê đơn của khách hiện tại, mới nhất trước. Mặc định `page=1`, `limit=20`; `page` phải từ 1 trở lên, `limit` từ 1 đến tối đa 100. Phản hồi có dạng `{ "items": [...], "page": 1, "limit": 20, "total": 1 }`; mỗi phần tử `items` có các trường đơn hàng ở trên nhưng không gồm `details`.
- `GET /orders/:orderId`: xem một đơn của khách hiện tại, kèm `details` theo thứ tự `variantId`; phản hồi có các trường như phản hồi tạo đơn.
- `POST /orders/:orderId/cancel`: hủy đơn đang `pending` của khách hiện tại. Với COD, hủy đơn chỉ đổi trạng thái. Với PayOS có URL đã lưu, server yêu cầu PayOS xác nhận link kết thúc và chưa nhận tiền trước khi hủy; trạng thái chưa rõ, có khoản thanh toán một phần, hoặc link chưa thể đối chiếu thì giữ đơn để xử lý tiếp và không giải phóng lượt voucher. Trả đơn đã cập nhật với `status: "cancelled"` khi hủy thành công. Hủy lại hoặc hủy đơn không còn `pending` trả `409 Conflict`; thao tác không cập nhật tồn kho.

Trạng thái đơn là `pending`, `packed` hoặc `cancelled`; trạng thái thanh toán là `unpaid` hoặc `paid`. COD là phương thức mặc định; PayOS là tùy chọn. PayOS chỉ nhận tổng đơn VND nguyên dương; nếu tổng sau voucher có phần lẻ VND, API trả `400` và không làm tròn. API không trả tồn kho khả dụng hoặc số lượng còn lại; hệ thống không theo dõi tồn kho.

`minPrice` so với tổng tiền hàng trước khi giảm giá, không bao gồm phí giao hàng. Voucher `fixed` giảm tối đa bằng giá trị cố định hoặc tổng tiền hàng, lấy giá trị nhỏ hơn. Voucher `percentage` tính theo phần trăm trên tổng tiền hàng, làm tròn half-up đến đơn vị cent, sau đó áp dụng `maxDiscount` nếu có và không bao giờ giảm quá tổng tiền hàng. Tổng đơn bằng `tổng tiền hàng - discountAmount + shippingFee`; phí giao hàng hiện là `0.00` và không được giảm. Đơn dùng voucher lưu `voucherId` và `discountAmount` tại thời điểm đặt để giữ lịch sử giá; thay đổi campaign/voucher sau đó không tính lại đơn cũ.

Giới hạn `quantity` là tổng lượt dùng toàn hệ thống. Một đơn được tính khi trạng thái là `pending` hoặc `packed`; đơn `cancelled` không tính. Hủy COD `pending` giải phóng lượt trong giao dịch đổi trạng thái; hủy PayOS chỉ đổi sang `cancelled` và giải phóng lượt sau khi PayOS xác nhận đúng link, chưa thu tiền và trạng thái cuối. Khi trạng thái provider chưa rõ hoặc link mồ côi không có checkout URL cục bộ, đơn vẫn pending và lượt tiếp tục được giữ. Đơn đã `packed` vẫn tính. Không có bộ đếm riêng hoặc giới hạn theo từng khách.

Voucher không tồn tại/không khả dụng, inactive, ngoài ngày hiệu lực, hết lượt hoặc không đạt `minPrice` trả `400 Bad Request` với lý do. Lỗi voucher không tạo một phần đơn hàng hoặc chi tiết đơn hàng. Nếu không gửi `voucherCode`, quy trình và COD hiện tại giữ nguyên.

## API quản trị đơn hàng và đóng gói

Các route dưới đây yêu cầu JWT của nhân viên active có role `order_staff` hoặc `admin` trong header `Authorization: Bearer <token>`. Employee hợp lệ nhưng thiếu role trả `403 Forbidden`; lỗi xác thực hoặc nhân viên không còn active trả `401 Unauthorized`.

- `GET /admin/orders?page=1&limit=20&status=pending`: danh sách theo `orderDate DESC, orderId DESC`. `page` mặc định 1, nhận số nguyên từ 1 đến 2,147,483,647; `limit` mặc định 20, nhận số nguyên từ 1 đến 100. `status` tùy chọn, chỉ nhận `pending`, `packed`, `cancelled`. Phản hồi có dạng `{ "items": [...], "page": 1, "limit": 20, "total": 1 }`; mỗi item chỉ gồm `orderId`, `orderDate`, `customerId`, `recipientName`, `status`, `paymentStatus`, `voucherCode`, `discountAmount`, `totalAmount`, `detailCount`. Danh sách không bao gồm địa chỉ hoặc dòng hàng. Trang hợp lệ nhưng vượt trang cuối trả danh sách `items` rỗng và `total` thực tế.
- `GET /admin/orders/:orderId`: trả `orderId`, `orderDate`, `customerId`, `voucherCode`, `recipientName`, `recipientPhone`, `shippingAddress`, `discountAmount`, `shippingFee`, `totalAmount`, `paymentMethod`, `paymentStatus`, `paymentConfirmedAt`, `paymentConfirmedByEmployeeId`, `paymentAttentionRequired`, `paymentAttempt`, `status`, `note`, `details`, `packing`. `voucherCode` là `null` khi không dùng voucher. `paymentConfirmedAt` và `paymentConfirmedByEmployeeId` là `null` trước khi xác nhận thanh toán. `paymentAttentionRequired` báo cần admin rà soát trạng thái giao dịch. `paymentAttempt` là `null` khi đơn không có PayOS attempt (COD hoặc tổng PayOS bằng 0); với attempt gồm `status`, `providerReference`, `observedAmountPaid`, `reconciliationReason`, `reconciliationAt`, `checkoutUrlMissing`. Endpoint không trả `checkoutUrl`, key, fingerprint hoặc thông tin chữ ký. `details` sắp theo `variantId`; mỗi dòng có `orderId`, `variantId`, `productName`, `size`, `color`, `quantity`, `unitPrice`, `subtotal`. `size` và `color` có thể là `null`. `packing` là `null` nếu đơn chưa đóng gói; nếu có thì gồm `packingId`, `packingDate`, `packingType`, `status`, `note`, `employeeId`.
- `POST /admin/orders/:orderId/pack`: body nhận `packingType` tùy chọn (`"bag"` hoặc `"box"`) và `note` tùy chọn (chuỗi tối đa 1000 ký tự). Ví dụ: `{ "packingType": "box", "note": "Đóng gói cẩn thận" }`. Chỉ đơn `pending` được gói; đơn PayOS phải `paid` trước khi gói. Có thể bỏ qua hai trường hoặc gửi `null` cho chúng (`@IsOptional` xem `null` như trường bị bỏ qua); chuỗi được trim, ghi chú rỗng sau khi trim trở thành `null`. Giá trị `note` không phải chuỗi và khác `null` trả `400 Bad Request`. Phản hồi HTTP `200` chứa cùng dạng đơn hàng với route chi tiết và thông tin đóng gói vừa tạo. Server lấy `employeeId`, thời gian và trạng thái từ phiên đăng nhập/server, không nhận các giá trị này từ client.
- `POST /admin/orders/:orderId/mark-paid`: không nhận body. Chỉ nhân viên có role `order_staff` hoặc `admin` cùng JWT hợp lệ và đang `active` mới dùng được. Chỉ xác nhận được đơn `packed`, chưa thanh toán, có phương thức `cod` hoặc `null` trên dòng dữ liệu cũ; trước khi xác nhận, nhân viên phải thực sự nhận đủ `totalAmount` bằng tiền mặt. Đóng gói không đồng nghĩa với đã thu tiền. Thành công trả HTTP `200` với chi tiết đơn quản trị đã cập nhật: `paymentStatus: "paid"`, `paymentConfirmedAt` lấy từ `CURRENT_TIMESTAMP` của PostgreSQL và `paymentConfirmedByEmployeeId` lấy từ JWT nhân viên. Đơn vẫn ở trạng thái `packed`. Đơn `pending`/`cancelled`, dùng PayOS hoặc đã thanh toán trả `409 Conflict`; ID sai định dạng, ngoài phạm vi hoặc không tồn tại trả `404 Not Found`. Phản hồi đơn hàng của khách không chứa `paymentConfirmedAt` hoặc `paymentConfirmedByEmployeeId`.

Trong mọi phản hồi quản trị đơn, ID, số lượng, số dòng, `page`, `limit`, `total`, `detailCount` là JSON integer; tiền là chuỗi thập phân có đúng hai chữ số sau dấu chấm; thời gian là chuỗi ISO 8601 theo UTC. `GET /admin/orders` không trả `paymentMethod`; `GET /admin/orders/:orderId` luôn trả `paymentMethod` là `cod` hoặc `payos` (giá trị null trên đơn legacy được chuẩn hóa thành `cod`). Ghi chú đơn, `size` và `color` có thể là JSON `null` khi chưa có. `packing` là `null` trước khi đơn được đóng gói; khi `packing` là object, chỉ `packingType` và `note` có thể là `null`, còn `packingId`, `packingDate`, `status` và `employeeId` luôn hiện diện và có giá trị. API chỉ chọn các trường cần thiết, không trả entity khách hàng hay `password_hash`.

Validation query/body, trường body không được hỗ trợ, `packingType` ngoài `bag`/`box`, ghi chú khác `null` nhưng không phải chuỗi hoặc dài quá 1000 ký tự trả `400 Bad Request`. ID đơn không hợp lệ hoặc không tồn tại trả `404 Not Found`. Chỉ đơn `pending` mới được đóng gói; đơn `packed` hoặc `cancelled` trả `409 Conflict`.

Đóng gói là một transaction: khóa dòng `sales_order` bằng pessimistic write lock, xác nhận trạng thái vẫn `pending` (và PayOS đã thanh toán), tạo một bản ghi `packing` với thời gian server và nhân viên từ JWT, chuyển đơn sang `packed`, rồi đọc lại phản hồi trước khi commit. Việc hủy khách hàng cũng khóa cùng dòng đơn trước khi kiểm tra trạng thái, nên các thao tác được tuần tự hóa. Xác nhận thủ công thanh toán cũng khóa cùng dòng đơn, chỉ dành cho đơn COD (hoặc dòng cũ có phương thức null), yêu cầu trạng thái `packed` và trạng thái `unpaid`, rồi cập nhật trạng thái thanh toán cùng thời điểm PostgreSQL và nhân viên xác nhận trong một transaction. Nhân viên chỉ xác nhận sau khi đã nhận đủ tổng tiền COD; PayOS chỉ được đánh dấu `paid` qua đối soát nhà cung cấp, không qua endpoint này. Đóng gói và xác nhận thanh toán không thay đổi số lượng hàng; hệ thống không theo dõi tồn kho. `shipping_fee` là phí giao hàng riêng; MVP không có cân nặng kiện hàng hay phí đóng gói.

## API thanh toán PayOS

PayOS checkout được khởi tạo bởi `POST /orders` có `paymentMethod: "payos"`; endpoint này vẫn yêu cầu customer JWT. Tổng tiền được lấy từ server sau áp dụng voucher. PayOS chỉ nhận VND nguyên dương; tổng có phần lẻ VND trả `400 Bad Request`, không làm tròn. Nếu tổng bằng 0, đơn chuyển ngay sang `paymentStatus: "paid"`, không gọi PayOS và không tạo payment attempt. Với tổng dương, server tạo một link hết hạn 15 phút tính từ `orderDate`. Link chỉ xuất hiện trong phản hồi đơn khách khi đơn còn `pending`, chưa trả tiền và URL đã được lưu cục bộ.

- `POST /payments/payos/webhook`: callback công khai của PayOS, không yêu cầu customer/employee JWT; phản hồi thành công là `{ "success": true }`. Server xác minh chữ ký bằng checksum key trước mọi đối chiếu dữ liệu. Payload phải báo `success: true`, mã thành công `00`, tiền tệ `VND` và dữ liệu khớp payment attempt cục bộ. Callback hợp lệ chỉ là tín hiệu để truy vấn trạng thái link trực tiếp từ PayOS; chỉ khi order code, link ID và số tiền khớp, trạng thái link là `PAID`, tổng `amountPaid` đúng bằng số tiền cần thu và `amountRemaining` bằng 0 thì đơn mới được đánh dấu `paid`. `paymentConfirmedAt` được ghi lúc đối soát và `paymentConfirmedByEmployeeId` giữ `null`. Chữ ký/payload sai trả `400` và không đổi dữ liệu; callback ký hợp lệ nhưng thất bại, không khớp hoặc order code không tồn tại được xác nhận thành công nhưng không làm đổi đơn. Nếu PayOS tạm thời không truy vấn được, API trả `503 Service Unavailable` để PayOS thử lại.
- Tác vụ nền chạy mỗi phút để đối soát attempt/link. Link chưa thanh toán sau 15 phút được yêu cầu hủy và chỉ khi PayOS xác nhận trạng thái cuối, chưa thu tiền, đúng số tiền thì đơn mới chuyển `cancelled`, attempt thành `expired`/`cancelled`/`failed` và lượt voucher được trả lại. Partial payment, số tiền/trạng thái không khớp hoặc kết quả provider chưa rõ được giữ cho admin rà soát; lượt voucher tiếp tục được giữ.
- Nếu PayOS đã tạo link nhưng phản hồi tạo link timeout và hệ thống không lưu được checkout URL, đơn được giữ `pending` cùng lượt voucher để admin rà soát, kể cả khi lần đối soát sau đó thấy link unpaid/cancelled. Không tự tạo link thay thế, tự hủy đơn hoặc cho khách hủy trong tình huống thiếu URL này. Admin xem cờ `paymentAttentionRequired`, trạng thái attempt, reference, số tiền quan sát được, lý do và thời điểm rà soát tại `GET /admin/orders/:orderId`; URL thanh toán không hiển thị trong API admin.
- Khi PayOS đang được đối soát hoặc API chưa thể xác định kết quả, lần tạo/retry có thể trả `503 Service Unavailable`. Các yêu cầu tới PayOS có timeout 20 giây, không tự retry tại SDK. Khách gửi lại cùng `Idempotency-Key` và cùng nội dung đơn để tiếp tục; cùng key với payload khác trả `409`. Không dùng query parameters của URL return/cancel hoặc lời chuyển hướng trình duyệt làm bằng chứng đã thanh toán.

Đơn PayOS đã xác nhận thanh toán mới được đóng gói qua `POST /admin/orders/:orderId/pack`. Chỉ `order_staff` hoặc `admin` thực hiện được route admin; employee khác không thể xác nhận PayOS qua `POST /admin/orders/:orderId/mark-paid`. COD tiếp tục dùng quy trình cũ: nhân viên gói đơn, nhận tiền mặt, rồi xác nhận đã thu tiền. Webhook cần endpoint HTTPS có thể truy cập từ PayOS; khi phát triển local, dùng tunnel HTTPS tạm thời tới API thay vì cấu hình `localhost` làm callback.

## API nhà cung cấp

Các endpoint đều yêu cầu JWT nhân viên active có role `purchasing_staff` hoặc `admin`:

- `GET /suppliers` và `GET /suppliers/:supplierId`: danh sách hoặc chi tiết.
- `POST /suppliers`: tạo với `name` và tùy chọn `address`, `email`.
- `PATCH /suppliers/:supplierId`: cập nhật một hoặc nhiều trường trên.
- `DELETE /suppliers/:supplierId`: xóa nhà cung cấp; trả `409` nếu đã có phiếu nhập tham chiếu.

## API phiếu nhập

Các endpoint đều yêu cầu JWT nhân viên active có role `purchasing_staff` hoặc `admin`:

- `GET /imports` và `GET /imports/:importId`: danh sách hoặc chi tiết phiếu nhập.
- `POST /imports`: tạo phiếu với `supplierId`, tùy chọn `note`, và 1–100 dòng `details`. Mỗi dòng có `variantId`, `quantity` nguyên dương và `unitPrice` dạng chuỗi thập phân tối đa hai chữ số, ví dụ:

```json
{
  "supplierId": 1,
  "note": "Nhập hàng đầu tháng",
  "details": [{ "variantId": 1, "quantity": 10, "unitPrice": "12500.00" }]
}
```

API lấy `employeeId` từ JWT, tính subtotal/tổng tiền phía server, rồi lưu phiếu và chi tiết trong cùng transaction. Số lượng phiếu nhập chỉ là lịch sử chứng từ mua hàng; chúng không làm tăng số lượng khả dụng, vì hệ thống không ghi nhận hay tính tồn kho. Không thể sửa/xóa phiếu nhập.

## API hóa đơn

- `GET /orders/:orderId/invoice`: customer JWT; chỉ xem hóa đơn của chính khách hàng.
- `GET /admin/orders/:orderId/invoice`: employee JWT active có role `order_staff` hoặc `admin`; role khác nhận `403 Forbidden`.
- Cả hai trả `invoiceId`, `orderId`, `issuedDate`, `totalAmount`, `status`. Chưa phát hành hoặc hóa đơn nằm ngoài phạm vi khách hàng trả `404`; hóa đơn được tạo cùng giao dịch xác nhận paid và tối đa một hóa đơn gắn với một đơn.

## Lệnh hữu ích

- `npm run build`: biên dịch TypeScript vào `dist/`
- `npm run lint`: kiểm tra quy tắc lint
- `npm run format`: định dạng mã nguồn trong `src/`
- `npm run start:dev`: chạy API ở chế độ theo dõi thay đổi
- `npm test`: chạy E2E qua HTTP thật cho phân quyền, đơn hàng, voucher và hóa đơn; đồng thời chạy kiểm thử nghiệp vụ PayOS với `FakePaymentProvider` trên PostgreSQL test. Không gọi PayOS thật.

### Chạy E2E an toàn với PostgreSQL test

Tạo trước một database PostgreSQL riêng, ví dụ `sales_system_test`, rồi chạy từ thư mục `backend` trong PowerShell:

```powershell
$env:TEST_DATABASE_URL = "postgresql://<user>:<password>@127.0.0.1:5432/sales_system_test"
npm test
Remove-Item Env:TEST_DATABASE_URL
```

Thay `<user>` và `<password>` bằng thông tin local của bạn; mã hóa ký tự đặc biệt trong URI nếu cần. `TEST_DATABASE_URL` là bắt buộc và database phải có tên kết thúc bằng `_test`. `npm test` sẽ xóa các bảng hiện có trong database đó, chạy lại migrations, rồi tạo dữ liệu kiểm thử. **Không trỏ biến này vào database đang dùng hoặc database chứa dữ liệu cần giữ.** Bộ test không đọc `DATABASE_URL` để chọn database test, không in thông tin kết nối và tắt cấu hình PayOS trong backend con.

## Mã nguồn

- `src/main.ts`: khởi động ứng dụng NestJS.
- `src/app.module.ts`: cấu hình module gốc và kết nối PostgreSQL.
- `src/catalog/entities/`: entity danh mục, sản phẩm và biến thể.
- `src/catalog/storefront.*`: API đọc danh mục và sản phẩm công khai.
- `src/customers/`: tài khoản khách hàng, hồ sơ và xác thực JWT riêng.
- `src/suppliers/`, `src/imports/`, `src/orders/`: quản lý nhà cung cấp, phiếu nhập và đơn hàng khách hàng.
- `src/employees/entities/`: entity nhân viên dùng cho đăng nhập.
- `src/auth/`: đăng nhập JWT, xác minh bearer token và băm mật khẩu.
- `src/database/data-source.ts`: cấu hình TypeORM CLI.
- `src/database/migrations/`: migration schema.
- `src/app.controller.ts` và `src/app.service.ts`: endpoint khởi tạo.
