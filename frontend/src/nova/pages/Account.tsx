import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../api";
import { useShop } from "../ShopContext";
import { useResource } from "../useResource";
import { AccountNav, Field, Notice, PageTitle, Pagination } from "../ui";
import { money } from "../money";
import type { Customer, Order, Page } from "../types";
export function Profile() {
  const { customer, updateCustomer, logout } = useShop();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const body = Object.fromEntries(
        ["name", "phone", "address", "dateOfBirth", "gender"].map((k) => [
          k,
          String(f.get(k) || "").trim() || null,
        ]),
      );
      const c = await api<Customer>("/auth/customer/profile", {
        method: "PATCH",
        body,
      });
      updateCustomer(c);
      setMessage("Đã cập nhật hồ sơ.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell py-16">
      <PageTitle eyebrow="NOVA MEMBER" title="HỒ SƠ" />
      <AccountNav />
      <form onSubmit={save} className="grid max-w-2xl gap-5">
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
        <Field
          label="HỌ TÊN"
          name="name"
          defaultValue={customer?.name}
          maxLength={120}
          required
        />
        <Field
          label="EMAIL"
          type="email"
          value={customer?.email || ""}
          disabled
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="SỐ ĐIỆN THOẠI"
            name="phone"
            type="tel"
            defaultValue={customer?.phone || ""}
            maxLength={30}
          />
          <Field
            label="NGÀY SINH"
            name="dateOfBirth"
            type="date"
            defaultValue={customer?.dateOfBirth || ""}
          />
        </div>
        <Field
          label="ĐỊA CHỈ"
          name="address"
          defaultValue={customer?.address || ""}
          maxLength={2000}
        />
        <Field
          label="GIỚI TÍNH"
          name="gender"
          defaultValue={customer?.gender || ""}
          maxLength={30}
        />
        <button className="button-dark" disabled={busy}>
          {busy ? "ĐANG LƯU…" : "LƯU THAY ĐỔI"}
        </button>
        <button
          type="button"
          className="button-outline"
          onClick={() => {
            logout();
            navigate("/");
          }}
        >
          ĐĂNG XUẤT
        </button>
      </form>
    </div>
  );
}
const statuses = {
  pending: "Chờ xử lý",
  packed: "Đã đóng gói",
  cancelled: "Đã hủy",
};
export function Orders() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const { data, error, loading } = useResource<Page<Order>>(
    "/orders?page=" + page + "&limit=10",
  );
  return (
    <div className="shell py-16">
      <PageTitle eyebrow="NOVA MEMBER" title="ĐƠN HÀNG" />
      <AccountNav />
      {loading ? (
        <Notice>Đang tải đơn hàng…</Notice>
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : (
        <>
          {!data?.items.length && (
            <Notice>Chưa có đơn hàng tại trang này.</Notice>
          )}
          <div className="grid gap-4">
            {data?.items.map((o) => (
              <Link
                key={o.orderId}
                to={"/account/orders/" + o.orderId}
                className="flex flex-wrap items-center justify-between gap-5 border border-black/15 bg-white p-6"
              >
                <div>
                  <strong>ĐƠN #{o.orderId}</strong>
                  <p className="mt-2 text-xs text-black/55">
                    {new Date(o.orderDate).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <span className={"status-badge status-" + o.status}>
                  {statuses[o.status]}
                </span>
                <span className="text-sm">
                  {o.paymentStatus === "paid"
                    ? "Đã thanh toán"
                    : "Chưa thanh toán"}
                </span>
                <strong>{money(o.totalAmount)}</strong>
                <span>CHI TIẾT →</span>
              </Link>
            ))}
          </div>
          <Pagination
            page={page}
            limit={10}
            total={data?.total || 0}
            onChange={(p) => setParams({ page: String(p) })}
          />
        </>
      )}
    </div>
  );
}
export function OrderDetail() {
  const { orderId } = useParams();
  const [revision, setRevision] = useState(0);
  const {
    data: o,
    error,
    loading,
  } = useResource<Order>("/orders/" + orderId, revision);
  const [cancelError, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/orders/" + orderId + "/cancel", { method: "POST" });
      setConfirm(false);
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
      setRevision((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell py-16">
      <Link className="text-xs font-bold" to="/account/orders">
        ← DANH SÁCH ĐƠN
      </Link>
      {loading ? (
        <Notice>Đang tải chi tiết…</Notice>
      ) : error ? (
        <Notice error>{error}</Notice>
      ) : (
        o && (
          <>
            <div className="mt-8">
              <PageTitle eyebrow="ORDER DETAILS" title={"ĐƠN #" + o.orderId} />
            </div>
            <div className="mb-8 flex gap-4">
              <span className={"status-badge status-" + o.status}>
                {statuses[o.status]}
              </span>
              <span className="status-badge bg-white">
                {o.paymentStatus === "paid"
                  ? "Đã thanh toán"
                  : "Chưa thanh toán"}
              </span>
            </div>
            <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
              <div className="border border-black/15 bg-white p-6">
                <h2 className="mb-5 font-bold">SẢN PHẨM ĐÃ ĐẶT</h2>
                {o.details?.map((l) => (
                  <div
                    key={l.variantId}
                    className="flex justify-between gap-4 border-t border-black/10 py-5"
                  >
                    <div>
                      <strong>
                        {l.productName || "Biến thể #" + l.variantId}
                      </strong>
                      {(l.size || l.color) && (
                        <p className="text-xs">
                          {l.color} / {l.size}
                        </p>
                      )}
                      <p className="mt-2 text-sm">
                        {money(l.unitPrice)} × {l.quantity}
                      </p>
                    </div>
                    <strong>{money(l.subtotal)}</strong>
                  </div>
                ))}
                <p className="mt-4 text-xs text-black/50">
                  Dữ liệu sản phẩm hiển thị theo thông tin được lưu trong đơn.
                </p>
              </div>
              <aside className="border border-black/15 bg-white p-6">
                <h2 className="mb-5 font-bold">THÔNG TIN NHẬN HÀNG</h2>
                <p>{o.recipientName}</p>
                <p className="mt-2 text-sm">{o.recipientPhone}</p>
                <p className="mt-2 text-sm">{o.shippingAddress}</p>
                {o.note && <p className="mt-3 text-sm">Ghi chú: {o.note}</p>}
                <dl className="mt-8 grid gap-4 border-t border-black/15 pt-5 text-sm">
                  <div className="flex justify-between">
                    <dt>Phương thức</dt>
                    <dd>{o.paymentMethod === "payos" ? "PayOS" : "COD"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Giảm giá {o.voucherCode}</dt>
                    <dd>{money(o.discountAmount)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Giao hàng</dt>
                    <dd>{money(o.shippingFee)}</dd>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <dt>TỔNG CỘNG</dt>
                    <dd>{money(o.totalAmount)}</dd>
                  </div>
                </dl>
              </aside>
            </div>
            {cancelError && <Notice error>{cancelError}</Notice>}
            {o.status === "pending" && (
              <div className="mt-8">
                {confirm ? (
                  <div className="border border-red-200 p-5">
                    <p>Hủy đơn #{o.orderId}?</p>
                    <div className="mt-3 flex gap-3">
                      <button
                        className="button-dark"
                        disabled={busy}
                        onClick={cancel}
                      >
                        {busy ? "ĐANG HỦY…" : "XÁC NHẬN HỦY"}
                      </button>
                      <button
                        className="button-outline"
                        disabled={busy}
                        onClick={() => setConfirm(false)}
                      >
                        GIỮ ĐƠN
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="button-outline"
                    onClick={() => setConfirm(true)}
                  >
                    HỦY ĐƠN HÀNG
                  </button>
                )}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
