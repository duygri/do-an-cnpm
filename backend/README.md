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

Schema biến thể hiện chưa có trạng thái riêng, vì vậy tất cả biến thể của sản phẩm đang `active` đều xuất hiện và được tính trong `priceFrom`. Sản phẩm không hoạt động hoặc không tồn tại trả `404`. API storefront không trả số tồn kho. Hệ thống không theo dõi số lượng hàng khả dụng; API đặt hàng chỉ kiểm tra sản phẩm đang hoạt động và biến thể hợp lệ.

## API chương trình khuyến mãi và voucher

Các route quản lý dưới đây yêu cầu JWT của nhân viên đang `active` trong header `Authorization: Bearer <token>`. Mọi nhân viên active đã xác thực đều có thể dùng API; hiện chưa có phân quyền theo vai trò. Token thiếu, sai, hết hạn hoặc nhân viên không còn active trả `401 Unauthorized`.

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

Mã voucher khi tạo hoặc gửi cùng đơn hàng được cắt khoảng trắng hai đầu, chuẩn hóa thành chữ hoa và chỉ nhận chữ ASCII, số, dấu gạch ngang hoặc gạch dưới; độ dài 1–64 ký tự. Mã duy nhất trên toàn hệ thống và không đổi sau khi tạo. `type` nhận `fixed` hoặc `percentage`; `discountValue` là chuỗi tiền dương có tối đa hai chữ số thập phân, tỷ lệ phần trăm không vượt quá `100.00`. `minPrice` là chuỗi tiền không âm; `maxDiscount` là chuỗi tiền dương tùy chọn và chỉ dùng với voucher phần trăm. `quantity` là số nguyên dương, giới hạn tổng lượt dùng trên tất cả khách hàng.

Input sai, ngày không hợp lệ hoặc khoảng ngày đảo ngược trả `400 Bad Request`. Không tìm thấy campaign/voucher, hoặc voucher không thuộc campaign trên URL, trả `404 Not Found`. Mã trùng sau chuẩn hóa hoặc giảm `quantity` thấp hơn số lượt hiện đang được giữ sẽ trả `409 Conflict`. Không có route `DELETE`; ngừng áp dụng bằng cách cập nhật `status` sang `inactive`. Campaign/voucher và mã vẫn được giữ để giải thích các đơn hàng cũ.

## API đơn hàng khách hàng

Tất cả route đơn hàng yêu cầu customer JWT trong header `Authorization: Bearer <token>`. Khách chỉ xem hoặc hủy đơn của chính mình; đơn không tồn tại hoặc thuộc khách khác trả `404`.

- `POST /orders`: tạo đơn với 1–100 biến thể khác nhau, số lượng nguyên dương, cùng thông tin giao hàng bắt buộc `recipientName`, `recipientPhone`, `shippingAddress`; `note` là tùy chọn. Tên người nhận tối đa 120 ký tự, điện thoại tối đa 30 ký tự; các chuỗi được cắt khoảng trắng và địa chỉ phải còn nội dung sau khi cắt. Ví dụ:

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

  Server lấy khách hàng từ JWT, kiểm tra sản phẩm còn hoạt động và biến thể hợp lệ, rồi tính giá từng dòng và tổng tiền. Số lượng đặt không được đối chiếu với số hàng khả dụng, vì hệ thống không theo dõi tồn kho. `voucherCode` là tùy chọn; nếu gửi, khách chỉ áp dụng được một mã. Giá, tổng tiền, giảm giá, phí giao hàng, phương thức/trạng thái thanh toán và trạng thái đơn do server quyết định; khách không thể chọn hoặc ghi đè các trường này. Không dùng voucher thì đơn mới có `voucherCode: null`, `discountAmount: "0.00"`; mọi đơn mới có `shippingFee: "0.00"`, `paymentMethod: "cod"`, `paymentStatus: "unpaid"`, `status: "pending"`. Tạo đơn và chi tiết được ghi nguyên tử. Phản hồi tạo đơn gồm `orderId`, `orderDate`, `customerId`, `voucherCode`, `recipientName`, `recipientPhone`, `shippingAddress`, `discountAmount`, `shippingFee`, `totalAmount`, `paymentMethod`, `paymentStatus`, `status`, `note` và `details` (mỗi dòng có `orderId`, `variantId`, `quantity`, `unitPrice`, `subtotal`).
- `GET /orders?page=1&limit=20`: liệt kê đơn của khách hiện tại, mới nhất trước. Mặc định `page=1`, `limit=20`; `page` phải từ 1 trở lên, `limit` từ 1 đến tối đa 100. Phản hồi có dạng `{ "items": [...], "page": 1, "limit": 20, "total": 1 }`; mỗi phần tử `items` có các trường đơn hàng ở trên nhưng không gồm `details`.
- `GET /orders/:orderId`: xem một đơn của khách hiện tại, kèm `details` theo thứ tự `variantId`; phản hồi có các trường như phản hồi tạo đơn.
- `POST /orders/:orderId/cancel`: hủy đơn đang `pending` của khách hiện tại. Trả đơn đã cập nhật với `status: "cancelled"` và chi tiết đơn. Hủy lại hoặc hủy đơn không còn `pending` trả `409 Conflict`; hủy đơn chỉ đổi trạng thái, không cập nhật tồn kho.

Trạng thái đơn là `pending`, `packed` hoặc `cancelled`; trạng thái thanh toán là `unpaid` hoặc `paid`. Đơn mới luôn dùng COD và bắt đầu ở trạng thái `unpaid`. API không trả tồn kho khả dụng hoặc số lượng còn lại; hệ thống không theo dõi tồn kho.

`minPrice` so với tổng tiền hàng trước khi giảm giá, không bao gồm phí giao hàng. Voucher `fixed` giảm tối đa bằng giá trị cố định hoặc tổng tiền hàng, lấy giá trị nhỏ hơn. Voucher `percentage` tính theo phần trăm trên tổng tiền hàng, làm tròn half-up đến đơn vị cent, sau đó áp dụng `maxDiscount` nếu có và không bao giờ giảm quá tổng tiền hàng. Tổng đơn bằng `tổng tiền hàng - discountAmount + shippingFee`; phí giao hàng hiện là `0.00` và không được giảm. Đơn dùng voucher lưu `voucherId` và `discountAmount` tại thời điểm đặt để giữ lịch sử giá; thay đổi campaign/voucher sau đó không tính lại đơn cũ.

Giới hạn `quantity` là tổng lượt dùng toàn hệ thống. Một đơn được tính khi trạng thái là `pending` hoặc `packed`; đơn `cancelled` không tính. Hủy đơn `pending` theo quy tắc hiện có giải phóng một lượt ngay trong giao dịch đổi trạng thái; đơn đã `packed` vẫn tính. Không có bộ đếm riêng hoặc giới hạn theo từng khách.

Voucher không tồn tại/không khả dụng, inactive, ngoài ngày hiệu lực, hết lượt hoặc không đạt `minPrice` trả `400 Bad Request` với lý do. Lỗi voucher không tạo một phần đơn hàng hoặc chi tiết đơn hàng. Nếu không gửi `voucherCode`, quy trình và COD hiện tại giữ nguyên.

## API quản trị đơn hàng và đóng gói

Các route dưới đây yêu cầu JWT nhân viên đang `active` trong header `Authorization: Bearer <token>`. Hệ thống hiện chưa có phân quyền theo vai trò: mọi nhân viên active đã xác thực đều dùng được các route quản trị. Token thiếu/sai/hết hạn hoặc nhân viên không còn active trả `401 Unauthorized`.

- `GET /admin/orders?page=1&limit=20&status=pending`: danh sách theo `orderDate DESC, orderId DESC`. `page` mặc định 1, nhận số nguyên từ 1 đến 2,147,483,647; `limit` mặc định 20, nhận số nguyên từ 1 đến 100. `status` tùy chọn, chỉ nhận `pending`, `packed`, `cancelled`. Phản hồi có dạng `{ "items": [...], "page": 1, "limit": 20, "total": 1 }`; mỗi item chỉ gồm `orderId`, `orderDate`, `customerId`, `recipientName`, `status`, `paymentStatus`, `voucherCode`, `discountAmount`, `totalAmount`, `detailCount`. Danh sách không bao gồm địa chỉ hoặc dòng hàng. Trang hợp lệ nhưng vượt trang cuối trả danh sách `items` rỗng và `total` thực tế.
- `GET /admin/orders/:orderId`: trả `orderId`, `orderDate`, `customerId`, `voucherCode`, `recipientName`, `recipientPhone`, `shippingAddress`, `discountAmount`, `shippingFee`, `totalAmount`, `paymentMethod`, `paymentStatus`, `paymentConfirmedAt`, `paymentConfirmedByEmployeeId`, `status`, `note`, `details`, `packing`. `voucherCode` là `null` khi không dùng voucher. `paymentConfirmedAt` và `paymentConfirmedByEmployeeId` là `null` trước khi xác nhận thanh toán. `details` sắp theo `variantId`; mỗi dòng có `orderId`, `variantId`, `productName`, `size`, `color`, `quantity`, `unitPrice`, `subtotal`. `size` và `color` có thể là `null`. `packing` là `null` nếu đơn chưa đóng gói; nếu có thì gồm `packingId`, `packingDate`, `packingType`, `status`, `note`, `employeeId`.
- `POST /admin/orders/:orderId/pack`: body nhận `packingType` tùy chọn (`"bag"` hoặc `"box"`) và `note` tùy chọn (chuỗi tối đa 1000 ký tự). Ví dụ: `{ "packingType": "box", "note": "Đóng gói cẩn thận" }`. Có thể bỏ qua hai trường hoặc gửi `null` cho chúng (`@IsOptional` xem `null` như trường bị bỏ qua); chuỗi được trim, ghi chú rỗng sau khi trim trở thành `null`. Giá trị `note` không phải chuỗi và khác `null` trả `400 Bad Request`. Phản hồi HTTP `200` chứa cùng dạng đơn hàng với route chi tiết và thông tin đóng gói vừa tạo. Server lấy `employeeId`, thời gian và trạng thái từ phiên đăng nhập/server, không nhận các giá trị này từ client.
- `POST /admin/orders/:orderId/mark-paid`: không nhận body. Chỉ nhân viên có JWT hợp lệ và đang `active` mới dùng được. Chỉ xác nhận được đơn `packed`, dùng COD và còn `unpaid`; trước khi xác nhận, nhân viên phải thực sự nhận đủ `totalAmount` bằng tiền mặt. Đóng gói không đồng nghĩa với đã thu tiền. Thành công trả HTTP `200` với chi tiết đơn quản trị đã cập nhật: `paymentStatus: "paid"`, `paymentConfirmedAt` lấy từ `CURRENT_TIMESTAMP` của PostgreSQL và `paymentConfirmedByEmployeeId` lấy từ JWT nhân viên. Đơn vẫn ở trạng thái `packed`. Đơn `pending`/`cancelled`, không dùng COD hoặc đã thanh toán trả `409 Conflict`; ID sai định dạng, ngoài phạm vi hoặc không tồn tại trả `404 Not Found`. Phản hồi đơn hàng của khách không chứa `paymentConfirmedAt` hoặc `paymentConfirmedByEmployeeId`.

Trong mọi phản hồi quản trị đơn, ID, số lượng, số dòng, `page`, `limit`, `total`, `detailCount` là JSON integer; tiền là chuỗi thập phân có đúng hai chữ số sau dấu chấm; thời gian là chuỗi ISO 8601 theo UTC. `paymentMethod`, ghi chú đơn, `size` và `color` có thể là JSON `null` khi chưa có. `packing` là `null` trước khi đơn được đóng gói; khi `packing` là object, chỉ `packingType` và `note` có thể là `null`, còn `packingId`, `packingDate`, `status` và `employeeId` luôn hiện diện và có giá trị. API chỉ chọn các trường cần thiết, không trả entity khách hàng hay `password_hash`.

Validation query/body, trường body không được hỗ trợ, `packingType` ngoài `bag`/`box`, ghi chú khác `null` nhưng không phải chuỗi hoặc dài quá 1000 ký tự trả `400 Bad Request`. ID đơn không hợp lệ hoặc không tồn tại trả `404 Not Found`. Chỉ đơn `pending` mới được đóng gói; đơn `packed` hoặc `cancelled` trả `409 Conflict`.

Đóng gói là một transaction: khóa dòng `sales_order` bằng pessimistic write lock, xác nhận trạng thái vẫn `pending`, tạo một bản ghi `packing` với thời gian server và nhân viên từ JWT, chuyển đơn sang `packed`, rồi đọc lại phản hồi trước khi commit. Việc hủy khách hàng cũng khóa cùng dòng đơn trước khi kiểm tra trạng thái, nên các thao tác được tuần tự hóa. Xác nhận thanh toán cũng khóa dòng đơn đó, yêu cầu trạng thái `packed`, phương thức COD và trạng thái `unpaid`, rồi cập nhật trạng thái thanh toán cùng thời điểm PostgreSQL và nhân viên xác nhận trong một transaction. Nhân viên chỉ xác nhận sau khi đã nhận đủ tổng tiền COD; không hỗ trợ thanh toán một phần hoặc hoàn tiền, và xác nhận này không tạo hóa đơn hay bắt đầu vòng đời giao/nhận. Đóng gói và xác nhận thanh toán không thay đổi số lượng hàng; hệ thống không theo dõi tồn kho. `shipping_fee` là phí giao hàng riêng; MVP không có cân nặng kiện hàng hay phí đóng gói.

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

API lấy `employeeId` từ JWT, tính subtotal/tổng tiền phía server, rồi lưu phiếu và chi tiết trong cùng transaction. Số lượng phiếu nhập chỉ là lịch sử chứng từ mua hàng; chúng không làm tăng số lượng khả dụng, vì hệ thống không ghi nhận hay tính tồn kho. Không thể sửa/xóa phiếu nhập.

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
- `src/suppliers/`, `src/imports/`, `src/orders/`: quản lý nhà cung cấp, phiếu nhập và đơn hàng khách hàng.
- `src/employees/entities/`: entity nhân viên dùng cho đăng nhập.
- `src/auth/`: đăng nhập JWT, xác minh bearer token và băm mật khẩu.
- `src/database/data-source.ts`: cấu hình TypeORM CLI.
- `src/database/migrations/`: migration schema.
- `src/app.controller.ts` và `src/app.service.ts`: endpoint khởi tạo.
