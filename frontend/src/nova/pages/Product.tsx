import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useResource } from "../useResource";
import { useShop } from "../ShopContext";
import { Image, Notice } from "../ui";
import { productImages } from "../media";
import { money } from "../money";
import type { Product as ProductData } from "../types";
export default function ProductPage() {
  const { id } = useParams();
  const state = useResource<ProductData>("/store/products/" + id);
  return (
    <div className="shell py-12">
      {state.loading ? (
        <Notice>Đang tải sản phẩm…</Notice>
      ) : state.error ? (
        <Notice error>{state.error}</Notice>
      ) : state.data ? (
        <Details key={id} product={state.data} />
      ) : null}
    </div>
  );
}
function Details({ product: p }: { product: ProductData }) {
  const { add, cart } = useShop();
  const [variantId, setVariant] = useState(p.variants[0]?.variantId);
  const [image, setImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const variant = p.variants.find((v) => v.variantId === variantId);
  const images = p.images || [];
  const buy = (now: boolean) => {
    if (!variant) return;
    if (
      cart.length >= 100 &&
      !cart.some((x) => x.variantId === variant.variantId)
    ) {
      setMessage("Giỏ hàng tối đa 100 biến thể.");
      return;
    }
    add({ productId: p.productId, variantId: variant.variantId, quantity });
    if (now) navigate("/checkout");
    else setMessage("Đã thêm sản phẩm vào giỏ hàng.");
  };
  return (
    <>
      <Link className="text-xs font-bold" to="/#shop">
        ← TIẾP TỤC MUA SẮM
      </Link>
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div>
          <Image
            src={images[image]?.imageUrl || productImages[p.productId]}
            alt={images[image]?.altText || p.name}
            className="aspect-[4/5] w-full object-cover"
          />
          <div className="mt-3 flex gap-3 overflow-auto">
            {images.map((img, i) => (
              <button
                key={img.productImageId}
                aria-label={`Xem ảnh ${i + 1}`}
                aria-pressed={image === i}
                className={`w-20 shrink-0 border-2 ${image === i ? "border-black" : "border-transparent"}`}
                onClick={() => setImage(i)}
              >
                <Image
                  src={img.imageUrl}
                  alt={img.altText || p.name}
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
        <div className="lg:pt-8">
          <p className="eyebrow">{p.category.name} / NOVA SUPPLY</p>
          <h1 className="mt-4 font-display text-5xl leading-none tracking-tight sm:text-6xl">
            {p.name}
          </h1>
          <p className="my-7 text-2xl font-bold">
            {variant ? money(variant.price) : "Chưa có biến thể để mua"}
          </p>
          <p className="text-sm leading-7 text-black/60">{p.description}</p>
          <fieldset className="mt-10">
            <legend className="text-xs font-bold tracking-widest">
              MÀU / SIZE
            </legend>
            <div className="mt-4 flex flex-wrap gap-2">
              {p.variants.map((v) => (
                <button
                  key={v.variantId}
                  aria-pressed={v.variantId === variantId}
                  onClick={() => setVariant(v.variantId)}
                  className={`border px-4 py-3 text-sm ${variantId === v.variantId ? "bg-black text-white" : "border-black/20"}`}
                >
                  {v.color || "Mặc định"} / {v.size || "Một cỡ"}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field my-6 max-w-32">
            <span>SỐ LƯỢNG</span>
            <input
              type="number"
              min={1}
              max={2147483647}
              value={quantity}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isSafeInteger(n) && n > 0 && n <= 2147483647)
                  setQuantity(n);
              }}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              className="button-dark"
              disabled={!variant}
              onClick={() => buy(false)}
            >
              THÊM VÀO GIỎ
            </button>
            <button
              className="button-lime"
              disabled={!variant}
              onClick={() => buy(true)}
            >
              MUA NGAY
            </button>
          </div>
          {message && (
            <Notice>
              {message}{" "}
              <Link to="/cart" className="underline">
                Xem giỏ
              </Link>
            </Notice>
          )}
          <p className="mt-8 border-t border-black/15 pt-5 text-xs text-black/50">
            Thanh toán khi nhận hàng · Thông tin đơn được xác nhận tại checkout.
          </p>
        </div>
      </div>
    </>
  );
}
