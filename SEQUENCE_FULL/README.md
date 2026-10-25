# Bộ sơ đồ sequence của hệ thống bán hàng

Các sơ đồ dưới đây được dựng theo backend hiện tại trong `do-an-cnpm-pr/backend/src` và các design spec trong `do-an-cnpm-pr/docs/superpowers/specs`.

## Danh sách sơ đồ

1. Đăng nhập nhân viên và xem hồ sơ
2. Đăng ký, đăng nhập và cập nhật hồ sơ khách hàng
3. Storefront công khai: xem danh mục và sản phẩm
4. Quản lý danh mục
5. Quản lý sản phẩm và biến thể
6. Quản lý nhà cung cấp
7. Tạo phiếu nhập hàng
8. Quản lý chương trình khuyến mãi và voucher
9. Khách đặt đơn COD
10. Khách đặt đơn PayOS
11. Khách hủy đơn COD
12. Webhook PayOS xác nhận thanh toán
13. Scheduler hết hạn đơn PayOS
14. Nhân viên xem và đóng gói đơn hàng
15. Nhân viên xác nhận thanh toán COD và phát hành hóa đơn
16. Tra cứu hóa đơn

> Lưu ý: hệ thống hiện không tính tồn kho khả dụng. Số lượng nhập và số lượng đặt chỉ là dữ liệu chứng từ.

Mỗi sơ đồ có đủ ba dạng:

- `.mmd`: mã Mermaid gốc.
- `.puml`: mã PlantUML để chỉnh sửa.
- `.png`: ảnh đã render sẵn để chèn vào báo cáo.

Thư mục `vp-style/` là bản trình bày theo mẫu Visual Paradigm trong repo: Actor, Boundary, Control, Entity, đánh số bước và màu nền xanh.
