import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Menu,
  Search,
  ShoppingBag,
  UserRound,
  X,
} from "lucide-react";
import { useShop } from "./ShopContext";
import { useResource } from "./useResource";
import type { Category } from "./types";
export function Logo() {
  return (
    <Link to="/" className="leading-none" aria-label="NOVA Supply - Trang chủ">
      <span className="block font-display text-[2rem] tracking-[-.08em]">
        NOVA
      </span>
      <span className="ml-0.5 block text-[9px] font-bold tracking-[.48em] opacity-60">
        SUPPLY
      </span>
    </Link>
  );
}
export default function Layout({ children }: { children: React.ReactNode }) {
  const { cartCount, customer, logout } = useShop();
  const categories = useResource<Category[]>("/store/categories");
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    setMenu(false);
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname, location.search, location.hash]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/?q=" + encodeURIComponent(query.trim()) + "#shop");
    setMenu(false);
  };
  return (
    <>
      <a href="#main" className="skip-link">
        Đến nội dung
      </a>
      <div className="bg-[#c8ff00] px-4 py-2 text-center text-[11px] font-bold uppercase tracking-[.12em]">
        NOVA SUPPLY · URBAN STREETWEAR · THANH TOÁN COD
      </div>
      <header className="sticky top-0 z-40 border-b border-black/10 bg-[#f6f5f0]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-10">
          <button
            className="icon-button mobile-menu-toggle"
            aria-label="Mở menu"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <Logo />
          <nav className="ml-6 hidden items-center gap-5 lg:flex">
            {categories.data?.slice(0, 4).map((c) => (
              <Link
                className="nav-link"
                key={c.categoryId}
                to={`/?categoryId=${c.categoryId}#shop`}
              >
                {c.name}
              </Link>
            ))}
          </nav>
          <form
            onSubmit={search}
            className="relative ml-auto hidden max-w-[270px] md:block"
          >
            <input
              aria-label="Tìm kiếm sản phẩm"
              placeholder="Tìm kiếm sản phẩm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              className="h-11 w-full border border-black/20 bg-transparent pl-10 pr-3 text-sm"
            />
            <button aria-label="Tìm kiếm" className="absolute left-3 top-3">
              <Search size={18} />
            </button>
          </form>
          <Link
            to="/cart"
            aria-label={`Giỏ hàng (${cartCount})`}
            className="icon-button relative ml-auto md:ml-0"
          >
            <ShoppingBag />
            {cartCount > 0 && (
              <span className="absolute -right-2 -top-2 bg-[#c8ff00] px-1 text-[10px] font-bold">
                {cartCount}
              </span>
            )}
          </Link>
          <Link
            className="icon-button"
            to={customer ? "/account/profile" : "/login"}
            aria-label="Tài khoản"
          >
            <UserRound />
          </Link>
        </div>
        {menu && (
          <div className="border-t border-black/15 bg-[#f6f5f0] p-5 lg:hidden">
            <div className="flex justify-between">
              <span className="eyebrow">KHÁM PHÁ NOVA</span>
              <button onClick={() => setMenu(false)} aria-label="Đóng menu">
                <X />
              </button>
            </div>
            <form onSubmit={search} className="my-5 flex gap-2">
              <input
                aria-label="Tìm trong NOVA"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm trong NOVA"
                maxLength={100}
                className="min-w-0 flex-1 border p-3"
              />
              <button className="button-dark">TÌM</button>
            </form>
            <nav>
              {categories.data?.map((c) => (
                <Link
                  className="flex justify-between border-t border-black/10 py-3 font-bold uppercase"
                  key={c.categoryId}
                  to={`/?categoryId=${c.categoryId}#shop`}
                >
                  {c.name}
                  <ArrowRight size={18} />
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
      <main id="main">{children}</main>
      <footer className="mt-24 bg-[#101010] text-white">
        <div className="mx-auto grid max-w-[1440px] gap-12 px-6 py-16 md:grid-cols-3 lg:px-10">
          <div>
            <Logo />
            <p className="mt-7 max-w-sm text-sm leading-6 text-white/55">
              Independent streetwear label built for movement, after dark and
              everything in between.
            </p>
          </div>
          <div>
            <p className="footer-title">SHOP</p>
            <Link to="/#shop">Tất cả sản phẩm</Link>
            <Link to="/cart">Giỏ hàng</Link>
          </div>
          <div>
            <p className="footer-title">TÀI KHOẢN</p>
            <Link to="/account/profile">Hồ sơ</Link>
            <Link to="/account/orders">Đơn hàng</Link>
            {customer && (
              <button
                className="mt-4 text-sm"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
              >
                Đăng xuất
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-white/10 px-6 py-5 text-center text-[10px] tracking-[.2em] text-white/40">
          © 2026 NOVA SUPPLY — SAIGON
        </div>
      </footer>
    </>
  );
}
