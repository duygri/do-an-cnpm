import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`my-5 border p-5 text-sm ${error ? "border-red-300 bg-red-50 text-red-800" : "border-black/15 bg-white"}`}
    >
      {children}
    </div>
  );
}
export function Image({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState("");
  return src && failed !== src ? (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(src)}
      loading="lazy"
    />
  ) : (
    <div
      role="img"
      aria-label={alt + " — chưa có ảnh"}
      className={`flex items-center justify-center bg-[#dddcd6] text-center text-xs text-black/50 ${className}`}
    >
      NOVA SUPPLY
      <br />
      CHƯA CÓ ẢNH
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="mb-10">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
    </div>
  );
}
export function Pagination({
  page,
  total,
  limit,
  onChange,
}: {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}) {
  return (
    <nav
      aria-label="Phân trang"
      className="mt-10 flex items-center justify-center gap-5"
    >
      <button
        className="icon-button"
        aria-label="Trang trước"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ArrowLeft />
      </button>
      <span className="text-sm">
        Trang {page} / {Math.max(1, Math.ceil(total / limit))}
      </span>
      <button
        className="icon-button"
        aria-label="Trang sau"
        disabled={page * limit >= total}
        onClick={() => onChange(page + 1)}
      >
        <ArrowRight />
      </button>
    </nav>
  );
}
export function AccountNav() {
  return (
    <nav className="mb-10 flex gap-5 border-b border-black/15 pb-4">
      <Link to="/account/profile">Hồ sơ</Link>
      <Link to="/account/orders">Đơn hàng</Link>
    </nav>
  );
}
export function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
