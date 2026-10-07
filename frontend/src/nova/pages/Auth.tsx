import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useShop } from "../ShopContext";
import { Field, Notice, PageTitle } from "../ui";
export function Protected({ children }: { children: React.ReactNode }) {
  const { customer, authLoading } = useShop();
  const location = useLocation();
  if (authLoading)
    return (
      <div className="shell">
        <Notice>Đang kiểm tra phiên đăng nhập…</Notice>
      </div>
    );
  return customer ? (
    <>{children}</>
  ) : (
    <Navigate
      to={
        "/login?next=" + encodeURIComponent(location.pathname + location.search)
      }
      replace
    />
  );
}
export default function Auth({ register = false }: { register?: boolean }) {
  const { authenticate, authError } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = new URLSearchParams(location.search).get("next");
  const target =
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    !next.startsWith("/login") &&
    !next.startsWith("/register")
      ? next
      : "/account/profile";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await authenticate(register ? "register" : "login", {
        email: String(values.get("email")).trim(),
        password: String(values.get("password")),
        ...(register ? { name: String(values.get("name")).trim() } : {}),
      });
      navigate(target, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-xl px-5 py-16">
      <PageTitle
        eyebrow="NOVA MEMBER"
        title={register ? "JOIN THE MOVEMENT" : "WELCOME BACK"}
      />
      <p className="mb-8 text-sm text-black/55">
        {register
          ? "Tạo tài khoản để bắt đầu hành trình cùng NOVA."
          : "Đăng nhập để theo dõi đơn hàng và tiếp tục hành trình cùng NOVA."}
      </p>
      {(error || authError) && <Notice error>{error || authError}</Notice>}
      <form onSubmit={submit} className="grid gap-5">
        {register && (
          <Field
            label="HỌ TÊN"
            name="name"
            autoComplete="name"
            maxLength={120}
            required
          />
        )}
        <Field
          label="EMAIL"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
        />
        <Field
          label="MẬT KHẨU"
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={register ? 12 : 1}
          maxLength={128}
          required
        />
        {register && (
          <p className="text-xs text-black/50">
            Mật khẩu dài từ 12 đến 128 ký tự.
          </p>
        )}
        <button className="button-dark w-full" disabled={busy}>
          {busy ? "ĐANG XỬ LÝ…" : register ? "ĐĂNG KÝ" : "ĐĂNG NHẬP"}
        </button>
      </form>
      <p className="mt-7 text-sm">
        {register ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
        <Link
          className="font-bold underline"
          to={
            (register ? "/login" : "/register") +
            "?next=" +
            encodeURIComponent(target)
          }
        >
          {register ? "Đăng nhập" : "Đăng ký ngay"}
        </Link>
      </p>
    </section>
  );
}
