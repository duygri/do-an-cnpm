import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';

export const Navbar: React.FC<{ onSearch?: (query: string) => void }> = ({ onSearch }) => {
  const { totalCount } = useCart();
  const { customer, customerLogout } = useAuth();
  const [searchValue, setSearchValue] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const navigate = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchValue);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      {/* Top Notification Bar */}
      <div className="bg-primary-container text-on-primary font-sans text-label-sm py-1.5 px-margin-sm text-center font-medium tracking-wide flex items-center justify-center gap-space-sm">
        <span>
          Miễn phí vận chuyển toàn quốc cho đơn hàng từ 499.000đ | Giảm thêm 10% đơn đầu tiên với mã{' '}
          <strong className="underline font-semibold tracking-wider">INDIGO10</strong>
        </span>
      </div>

      {/* Main Header Row */}
      <div className="h-20 max-w-7xl mx-auto px-gutter flex items-center justify-between gap-space-lg">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-space-sm shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-xl shadow-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 19L12 5L17 19" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 14H15" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="3.5" r="1.5" fill="#38BDF8" />
            </svg>
          </div>
          <span className="font-sans text-headline-sm font-bold tracking-tight text-on-surface hidden sm:inline-block">
            INDIGO STUDIO
          </span>
        </Link>

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-lg relative">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-xl">
              search
            </span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                if (onSearch) onSearch(e.target.value);
              }}
              className="w-full h-11 pl-11 pr-4 bg-surface-container-low rounded-lg font-sans text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary focus:bg-surface transition-all shadow-none"
              placeholder="Tìm kiếm áo sơ mi, polo, quần tây, đầm..."
            />
            <div className="hidden lg:flex items-center gap-1.5 absolute right-2.5 top-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => {
                  setSearchValue('Polo');
                  if (onSearch) onSearch('Polo');
                }}
                className="font-sans text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container transition-colors"
              >
                Polo
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchValue('Linen');
                  if (onSearch) onSearch('Linen');
                }}
                className="font-sans text-label-sm px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container transition-colors"
              >
                Linen
              </button>
            </div>
          </div>
        </form>

        {/* Action Icons */}
        <div className="flex items-center gap-space-md shrink-0">
          {/* Wishlist */}
          <button
            aria-label="Yêu thích"
            className="relative p-2 rounded-full hover:bg-surface-container-low transition-colors text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-2xl">favorite</span>
            <span className="absolute top-1 right-1 w-4 h-4 bg-error text-on-error font-sans text-[10px] leading-none rounded-full flex items-center justify-center font-bold">
              2
            </span>
          </button>

          {/* Cart Button */}
          <Link
            to="/cart"
            aria-label="Giỏ hàng"
            className="relative flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container hover:text-on-surface transition-colors text-on-surface"
          >
            <span className="material-symbols-outlined text-2xl text-primary">shopping_bag</span>
            <span className="hidden sm:inline font-sans text-label-md font-semibold">Giỏ hàng</span>
            <span className="w-5 h-5 bg-primary text-on-primary font-sans text-label-sm rounded-full flex items-center justify-center font-bold">
              {totalCount}
            </span>
          </Link>

          {/* Customer account actions */}
          {customer ? (
            <div className="relative">
              <button
                type="button"
                aria-expanded={showUserMenu}
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 pl-space-xs group"
              >
                <span className="w-8 h-8 rounded-full bg-primary-soft ring-2 ring-primary-soft flex items-center justify-center font-sans text-label-md font-bold text-primary">
                  {(customer.name || customer.email).charAt(0).toUpperCase()}
                </span>
                <span className="hidden xl:flex flex-col text-left">
                  <span className="font-sans text-label-md font-semibold text-on-surface leading-tight">
                    {customer.name || customer.email || 'Khách hàng'}
                  </span>
                  <span className="font-sans text-label-sm text-outline leading-none">Tài khoản khách hàng</span>
                </span>
                <span className="material-symbols-outlined text-outline group-hover:text-on-surface transition-colors text-lg">
                  expand_more
                </span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-surface rounded-xl shadow-lg border border-border-neutral py-2 z-50">
                  <div className="px-4 py-2 border-b border-border-neutral">
                    <p className="text-xs text-text-muted">Tài khoản khách hàng</p>
                    <p className="text-sm font-semibold text-text-primary truncate">{customer.email}</p>
                  </div>
                  <Link
                    to="/orders"
                    onClick={() => setShowUserMenu(false)}
                    className="block px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    Đơn hàng của tôi
                  </Link>
                  <button
                    onClick={() => {
                      customerLogout();
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-destructive-soft transition-colors"
                  >
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-primary px-3 py-2 font-sans text-label-md font-semibold text-on-primary transition hover:opacity-90"
            >
              Đăng nhập
            </Link>
          )}
        </div>
      </div>

      {/* Sub Navigation Bar */}
      <div className="bg-surface/95 border-t border-border-neutral/60">
        <div className="max-w-7xl mx-auto px-gutter">
          <nav className="flex items-center gap-gutter overflow-x-auto py-2">
            <Link to="/" className="font-sans text-label-lg text-primary font-bold whitespace-nowrap py-1">
              Trang chủ
            </Link>
            <a href="#catalog-grid" className="font-sans text-label-lg text-on-surface-variant hover:text-on-surface whitespace-nowrap py-1 transition-colors">
              Bộ sưu tập mới
            </a>
            <a href="#catalog-grid" className="font-sans text-label-lg text-on-surface-variant hover:text-on-surface whitespace-nowrap py-1 transition-colors">
              Nam
            </a>
            <a href="#catalog-grid" className="font-sans text-label-lg text-on-surface-variant hover:text-on-surface whitespace-nowrap py-1 transition-colors">
              Nữ
            </a>
            <a href="#catalog-grid" className="font-sans text-label-lg text-on-surface-variant hover:text-on-surface whitespace-nowrap py-1 transition-colors">
              Phụ kiện
            </a>
            <a href="#catalog-grid" className="font-sans text-label-lg text-on-surface-variant hover:text-on-surface whitespace-nowrap py-1 flex items-center gap-1.5 transition-colors">
              <span>Khuyến mãi</span>
              <span className="px-1.5 py-0.5 bg-error text-on-error font-sans text-[10px] leading-tight font-bold rounded-full uppercase">
                HOT
              </span>
            </a>
          </nav>

        </div>
      </div>
    </header>
  );
};
