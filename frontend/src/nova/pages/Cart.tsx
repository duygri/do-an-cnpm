import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useCartProducts, useShop } from "../ShopContext";
import type { ResolvedLine } from "../ShopContext";
import { Image, Notice, PageTitle } from "../ui";
import { productImages } from "../media";
import { cents, decimal, money } from "../money";
export function total(lines: ResolvedLine[]) {
  return decimal(
    lines.reduce(
      (sum, l) =>
        sum + (l.variant ? cents(l.variant.price) * BigInt(l.quantity) : 0n),
      0n,
    ),
  );
}
export default function Cart() {
  const { cart, setQuantity, remove } = useShop();
  const { lines, loading, reload } = useCartProducts();
  return (
    <div className="shell py-16">
      <PageTitle eyebrow="YOUR SELECTION" title="GIỎ HÀNG" />
      {!cart.length ? (
        <Notice>
          Giỏ hàng đang trống.{" "}
          <Link className="underline" to="/#shop">
            Khám phá sản phẩm
          </Link>
        </Notice>
      ) : loading ? (
        <Notice>Đang kiểm tra sản phẩm và giá…</Notice>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            {lines.map((l) => (
              <article
                key={l.variantId}
                className="mb-5 flex gap-4 border-b border-black/15 pb-5"
              >
                <Image
                  src={
                    l.product?.images?.find((i) => i.isPrimary)?.imageUrl ||
                    l.product?.images?.[0]?.imageUrl ||
                    productImages[l.productId]
                  }
                  alt={l.product?.name || "Sản phẩm"}
                  className="h-32 w-24 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <Link to={"/products/" + l.productId} className="font-bold">
                    {l.product?.name || "Sản phẩm #" + l.productId}
                  </Link>
                  <p className="my-2 text-xs text-black/55">
                    {l.variant?.color} / {l.variant?.size}
                  </p>
                  {l.error ? (
                    <Notice error>{l.error}</Notice>
                  ) : (
                    <p className="text-sm">{money(l.variant!.price)}</p>
                  )}
                  <label className="mt-3 flex items-center gap-3 text-xs">
                    Số lượng
                    <input
                      aria-label={`Số lượng ${l.product?.name || l.variantId}`}
                      className="w-24 border p-2"
                      type="number"
                      min={1}
                      max={2147483647}
                      value={l.quantity}
                      onChange={(e) =>
                        setQuantity(l.variantId, Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <button
                  className="self-start p-2"
                  aria-label={"Xóa " + (l.product?.name || l.variantId)}
                  onClick={() => remove(l.variantId)}
                >
                  <Trash2 size={18} />
                </button>
              </article>
            ))}
          </div>
          <aside className="h-fit border border-black/20 bg-white p-6">
            <h2 className="text-lg font-bold">TÓM TẮT ĐƠN HÀNG</h2>
            <div className="my-6 flex justify-between">
              <span>Tạm tính</span>
              <strong>{money(total(lines))}</strong>
            </div>
            <p className="mb-6 text-xs leading-6 text-black/55">
              Giá và mã giảm giá được kiểm tra lại khi đặt hàng. Phí giao hàng
              hiện tại: 0 ₫.
            </p>
            {lines.some((l) => l.error) ? (
              <>
                <Notice error>
                  Vui lòng xóa sản phẩm không khả dụng hoặc tải lại trước khi
                  thanh toán.
                </Notice>
                <button className="button-outline" onClick={reload}>
                  THỬ LẠI
                </button>
              </>
            ) : (
              <Link to="/checkout" className="button-lime w-full">
                TIẾN HÀNH ĐẶT HÀNG →
              </Link>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
