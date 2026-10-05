import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-surface-container-lowest mt-space-xl border-t border-border-neutral">
      <div className="max-w-7xl mx-auto px-gutter py-space-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-lg">
          {/* Brand Info */}
          <div className="space-y-space-md">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-base shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M7 19L12 5L17 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9 14H15" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="3.5" r="1.5" fill="#38BDF8" />
                </svg>
              </div>
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface">INDIGO STUDIO</span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Thương hiệu thời trang ứng dụng và phong cách sống cao cấp, định hình phong cách hiện đại với chuẩn mực may mặc tinh xảo và bền vững.
            </p>
            <div className="space-y-1.5 font-body-sm text-body-sm text-outline">
              <p className="flex items-start gap-2">
                <span className="material-symbols-outlined text-base text-primary shrink-0">location_on</span>
                <span>Flagship Store: 88 Đồng Khởi, P. Bến Nghé, Quận 1, TP. HCM</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="material-symbols-outlined text-base text-primary shrink-0">location_on</span>
                <span>Boutique: 25 Tràng Tiền, Hoàn Kiếm, Hà Nội</span>
              </p>
              <p className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-primary shrink-0">call</span>
                <span>
                  Hotline hỗ trợ: <strong className="text-on-surface font-semibold">1900 6868</strong> (8:00 - 22:00)
                </span>
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-low">
              <span className="material-symbols-outlined text-tertiary text-lg">verified</span>
              <span className="font-label-sm text-label-sm font-semibold text-on-surface">Đã chứng nhận Bộ Công Thương</span>
            </div>
          </div>

          {/* Categories */}
          <div>
            <h3 className="font-label-lg text-label-lg font-bold text-on-surface uppercase tracking-wider mb-space-md">
              Danh mục sản phẩm
            </h3>
            <ul className="space-y-2.5 font-body-md text-body-md text-on-surface-variant">
              <li><a className="hover:text-primary transition-colors" href="#catalog-grid">Thời trang Nam</a></li>
              <li><a className="hover:text-primary transition-colors" href="#catalog-grid">Thời trang Nữ</a></li>
              <li><a className="hover:text-primary transition-colors" href="#catalog-grid">Bộ sưu tập Thu Đông 2025</a></li>
              <li><a className="hover:text-primary transition-colors" href="#catalog-grid">Giày &amp; Phụ kiện thời thượng</a></li>
              <li><a className="hover:text-primary transition-colors" href="#catalog-grid">Sản phẩm bán chạy (Best Sellers)</a></li>
              <li><a className="hover:text-primary transition-colors" href="#catalog-grid">Ưu đãi đặc quyền Online</a></li>
            </ul>
          </div>

          {/* Customer Support */}
          <div>
            <h3 className="font-label-lg text-label-lg font-bold text-on-surface uppercase tracking-wider mb-space-md">
              Hỗ trợ khách hàng
            </h3>
            <ul className="space-y-2.5 font-body-md text-body-md text-on-surface-variant">
              <li><a className="hover:text-primary transition-colors" href="#">Chính sách đổi trả 30 ngày tận nơi</a></li>
              <li><a className="hover:text-primary transition-colors" href="#">Bảng quy chuẩn &amp; hướng dẫn chọn size</a></li>
              <li><Link className="hover:text-primary transition-colors" to="/orders">Tra cứu tình trạng đơn hàng realtime</Link></li>
              <li><a className="hover:text-primary transition-colors" href="#">Phương thức thanh toán &amp; Biểu phí ship</a></li>
              <li><a className="hover:text-primary transition-colors" href="#">Chính sách thẻ thành viên Indigo Club</a></li>
              <li><a className="hover:text-primary transition-colors" href="#">Câu hỏi thường gặp (FAQ)</a></li>
            </ul>
          </div>

          {/* VIP Newsletter */}
          <div className="space-y-space-md">
            <h3 className="font-label-lg text-label-lg font-bold text-on-surface uppercase tracking-wider">
              Bản tin VIP
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Đăng ký nhận thông tin sớm về các bộ sưu tập giới hạn và mã ưu đãi độc quyền.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); alert('Cảm ơn bạn đã đăng ký nhận bản tin!'); }} className="flex items-center gap-2">
              <input
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface"
                placeholder="Nhập email của bạn..."
                type="email"
                required
              />
              <button
                type="submit"
                className="h-10 px-4 bg-primary text-on-primary font-label-md text-label-md rounded-lg font-medium hover:bg-primary-hover transition-colors shrink-0"
              >
                Gửi
              </button>
            </form>
            <div className="pt-space-xs">
              <h4 className="font-label-sm text-label-sm font-semibold text-on-surface uppercase tracking-wider mb-2">
                Cổng thanh toán bảo mật
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-1 bg-surface-container-low rounded text-on-surface-variant font-label-sm text-[11px] font-semibold">COD</span>
                <span className="px-2 py-1 bg-surface-container-low rounded text-on-surface-variant font-label-sm text-[11px] font-semibold">VietQR</span>
                <span className="px-2 py-1 bg-surface-container-low rounded text-on-surface-variant font-label-sm text-[11px] font-semibold">PayOS</span>
                <span className="px-2 py-1 bg-surface-container-low rounded text-on-surface-variant font-label-sm text-[11px] font-semibold">Visa/Mastercard</span>
                <span className="px-2 py-1 bg-surface-container-low rounded text-on-surface-variant font-label-sm text-[11px] font-semibold">Ví MoMo</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="mt-space-xl pt-6 border-t border-border-neutral flex flex-col md:flex-row items-center justify-between gap-4 font-body-sm text-body-sm text-outline">
          <p>© 2026 INDIGO Studio Apparel. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a className="hover:text-on-surface transition-colors" href="#">Điều khoản sử dụng</a>
            <a className="hover:text-on-surface transition-colors" href="#">Chính sách bảo mật</a>
            <a className="hover:text-on-surface transition-colors" href="#">Hệ thống cửa hàng</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
