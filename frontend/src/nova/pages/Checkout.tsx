import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useCartProducts, useShop } from "../ShopContext";
import { Field, Notice, PageTitle } from "../ui";
import { money } from "../money";
import { total } from "./Cart";
import type { Order } from "../types";
export default function Checkout() {
  const { customer, cart, removePurchased } = useShop();
  const state = useCartProducts();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(
    () =>
      sessionStorage.getItem("nova-cod-uncertain:" + customer!.customerId) ===
      "1",
  );
  const lock = useRef(false);
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => {
    const defaults = {
      recipientName: customer?.name || "",
      recipientPhone: customer?.phone || "",
      shippingAddress: customer?.address || "",
      note: "",
      voucherCode: "",
    };
    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem("nova-checkout:" + customer!.customerId) ||
          "null",
      );
      if (saved && typeof saved === "object") {
        for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
          const value = (saved as Record<string, unknown>)[key];
          if (typeof value === "string") defaults[key] = value;
        }
      }
    } catch {
      /* Ignore invalid saved drafts. */
    }
    return defaults;
  });
  const change = (field: keyof typeof draft, value: string) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    sessionStorage.setItem(
      "nova-checkout:" + customer!.customerId,
      JSON.stringify(next),
    );
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      lock.current ||
      uncertain ||
      state.loading ||
      state.lines.some((l) => l.error) ||
      !cart.length
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    sessionStorage.setItem("nova-cod-uncertain:" + customer!.customerId, "1");
    const purchased = cart.map((x) => ({ ...x }));
    try {
      const order = await api<Order>("/orders", {
        method: "POST",
        body: {
          recipientName: draft.recipientName.trim(),
          recipientPhone: draft.recipientPhone.trim(),
          shippingAddress: draft.shippingAddress.trim(),
          note: draft.note.trim(),
          ...(draft.voucherCode.trim()
            ? { voucherCode: draft.voucherCode.trim().toUpperCase() }
            : {}),
          paymentMethod: "cod",
          details: purchased.map(({ variantId, quantity }) => ({
            variantId,
            quantity,
          })),
        },
      });
      sessionStorage.removeItem("nova-cod-uncertain:" + customer!.customerId);
      removePurchased(purchased);
      sessionStorage.removeItem("nova-checkout:" + customer!.customerId);
      navigate("/account/orders/" + order.orderId, { replace: true });
    } catch (e) {
      setError((e as Error).message);
      if (!(e instanceof ApiError) || e.uncertain) {
        setUncertain(true);
        sessionStorage.setItem(
          "nova-cod-uncertain:" + customer!.customerId,
          "1",
        );
      } else {
        sessionStorage.removeItem("nova-cod-uncertain:" + customer!.customerId);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="shell py-16">
      <PageTitle eyebrow="ONE LAST STEP" title="CHECKOUT" />
      {!cart.length ? (
        <Notice>
          Giỏ hàng trống.{" "}
          <Link to="/" className="underline">
            Mua sắm
          </Link>
        </Notice>
      ) : state.loading ? (
        <Notice>Đang kiểm tra sản phẩm…</Notice>
      ) : state.lines.some((l) => l.error) ? (
        <Notice error>
          Có sản phẩm không khả dụng hoặc không tải được.{" "}
          <Link to="/cart" className="underline">
            Quay lại giỏ hàng
          </Link>
        </Notice>
      ) : (
        <form
          onSubmit={submit}
          className="grid gap-12 lg:grid-cols-[1fr_380px]"
        >
          <div>
            <h2 className="mb-6 text-xl font-bold">01 / THÔNG TIN NHẬN HÀNG</h2>
            <div className="grid gap-5">
              <Field
                label="HỌ TÊN NGƯỜI NHẬN"
                value={draft.recipientName}
                onChange={(e) => change("recipientName", e.target.value)}
                maxLength={120}
                autoComplete="name"
                required
              />
              <Field
                label="SỐ ĐIỆN THOẠI"
                type="tel"
                value={draft.recipientPhone}
                onChange={(e) => change("recipientPhone", e.target.value)}
                maxLength={30}
                autoComplete="tel"
                required
              />
              <Field
                label="ĐỊA CHỈ NHẬN HÀNG"
                value={draft.shippingAddress}
                onChange={(e) => change("shippingAddress", e.target.value)}
                autoComplete="street-address"
                required
              />
              <Field
                label="GHI CHÚ (TÙY CHỌN)"
                value={draft.note}
                onChange={(e) => change("note", e.target.value)}
              />
            </div>
            <h2 className="mb-5 mt-12 text-xl font-bold">02 / THANH TOÁN</h2>
            <div className="border-2 border-black bg-white p-5">
              <strong>Thanh toán khi nhận hàng (COD)</strong>
              <p className="mt-2 text-sm text-black/55">
                Thanh toán số tiền được xác nhận trong đơn khi nhận hàng.
              </p>
            </div>
            <div className="mt-8">
              <Field
                label="MÃ GIẢM GIÁ (TÙY CHỌN)"
                value={draft.voucherCode}
                maxLength={64}
                onChange={(e) => change("voucherCode", e.target.value)}
              />
              <p className="mt-2 text-xs text-black/55">
                Mã được kiểm tra khi đặt hàng. Khoản giảm giá và tổng cuối cùng
                hiển thị trong đơn đã tạo.
              </p>
            </div>
          </div>
          <aside className="h-fit border border-black/20 bg-white p-6">
            <h2 className="mb-6 text-lg font-bold">ĐƠN HÀNG CỦA BẠN</h2>
            {state.lines.map((l) => (
              <div
                key={l.variantId}
                className="flex justify-between gap-4 border-b border-black/10 py-3 text-sm"
              >
                <span>
                  {l.product?.name}
                  <small className="block text-black/50">
                    {l.variant?.color} / {l.variant?.size} × {l.quantity}
                  </small>
                </span>
                <span>{money(l.variant!.price)}</span>
              </div>
            ))}
            <div className="my-6 grid gap-3 text-sm">
              <div className="flex justify-between">
                <span>Tạm tính</span>
                <strong>{money(total(state.lines))}</strong>
              </div>
              <div className="flex justify-between">
                <span>Phí giao hàng</span>
                <span>0 ₫</span>
              </div>
              <p className="text-xs text-black/50">
                Chưa trừ voucher. Máy chủ xác nhận giá cuối cùng.
              </p>
            </div>
            {error && <Notice error>{error}</Notice>}
            {uncertain && (
              <Notice error>
                Chưa xác định đơn đã được tạo hay chưa. Không gửi lại ngay.{" "}
                <Link className="underline" to="/account/orders">
                  Kiểm tra lịch sử đơn
                </Link>{" "}
                trước khi thử lại.
                <button
                  type="button"
                  className="mt-4 underline"
                  onClick={() => {
                    sessionStorage.removeItem(
                      "nova-cod-uncertain:" + customer!.customerId,
                    );
                    setUncertain(false);
                  }}
                >
                  Tôi đã kiểm tra và chưa có đơn này
                </button>
              </Notice>
            )}
            <button className="button-lime w-full" disabled={busy || uncertain}>
              {busy ? "ĐANG ĐẶT HÀNG…" : "ĐẶT HÀNG COD →"}
            </button>
            <Link
              to="/cart"
              className="mt-5 block text-center text-xs underline"
            >
              Quay lại giỏ hàng
            </Link>
          </aside>
        </form>
      )}
    </div>
  );
}
