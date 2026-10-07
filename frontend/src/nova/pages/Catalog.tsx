import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import Hero from "../Hero";
import { useResource } from "../useResource";
import { Image, Notice, Pagination } from "../ui";
import { editorialImages, productImages } from "../media";
import { money } from "../money";
import type { Category, Page, ProductSummary } from "../types";
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const categoryId = params.get("categoryId") || "";
  const q = params.get("q") || "";
  const query = new URLSearchParams({ page: String(page), limit: "12" });
  if (categoryId) query.set("categoryId", categoryId);
  if (q) query.set("q", q);
  const resource = useResource<Page<ProductSummary>>(
    "/store/products?" + query,
  );
  const categories = useResource<Category[]>("/store/categories");
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  return (
    <>
      <Hero />
      <section className="shell py-16 lg:py-24">
        <p className="eyebrow">SHOP BY CATEGORY</p>
        <h2 className="section-title mb-10">BUILT FOR THE CITY</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {categories.data?.slice(0, 4).map((c, i) => (
            <Link
              to={`/?categoryId=${c.categoryId}#shop`}
              key={c.categoryId}
              className="group relative aspect-[3/4] overflow-hidden bg-black text-white"
            >
              <img
                src={editorialImages[i]}
                alt=""
                className="h-full w-full object-cover opacity-65 transition duration-700 group-hover:scale-105"
              />
              <span className="absolute bottom-4 left-4 font-display text-2xl sm:text-4xl">
                {c.name}
              </span>
              <ArrowRight className="absolute right-4 top-4 -rotate-45" />
            </Link>
          ))}
        </div>
      </section>
      <section id="shop" className="scroll-mt-28 border-t border-black/15">
        <div className="shell py-16">
          <p className="eyebrow">NOVA CATALOGUE / 2026</p>
          <h2 className="section-title">{q ? `KẾT QUẢ “${q}”` : "SHOP ALL"}</h2>
          <div className="my-8 flex flex-wrap gap-3">
            <label className="field max-w-xs">
              <span>DANH MỤC</span>
              <select
                aria-label="DANH MỤC"
                value={categoryId}
                onChange={(e) => update("categoryId", e.target.value)}
              >
                <option value="">Tất cả</option>
                {categories.data?.map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="ml-auto self-end text-xs font-bold tracking-widest">
              {resource.data?.total ?? "—"} SẢN PHẨM
            </p>
          </div>
          {categories.error && <Notice error>{categories.error}</Notice>}
          {resource.loading ? (
            <Notice>Đang tải sản phẩm…</Notice>
          ) : resource.error ? (
            <Notice error>{resource.error}</Notice>
          ) : (
            <>
              {!resource.data?.items.length && (
                <Notice>
                  Chưa có sản phẩm phù hợp. Thử từ khóa hoặc danh mục khác.
                </Notice>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
                {resource.data?.items.map((p) => (
                  <article key={p.productId} className="group">
                    <Link
                      to={`/products/${p.productId}`}
                      className="relative block aspect-[4/5] overflow-hidden bg-[#dddcd6]"
                    >
                      <Image
                        src={p.primaryImageUrl || productImages[p.productId]}
                        alt={p.name}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                      />
                      <span className="absolute bottom-0 inset-x-0 bg-black p-3 text-center text-xs font-bold text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                        XEM CHI TIẾT
                      </span>
                    </Link>
                    <p className="mt-4 text-[10px] uppercase tracking-widest text-black/45">
                      {p.category.name}
                    </p>
                    <div className="mt-1 flex flex-wrap justify-between gap-2">
                      <Link
                        className="font-bold"
                        to={`/products/${p.productId}`}
                      >
                        {p.name}
                      </Link>
                      <span className="text-sm">
                        {p.priceFrom !== null
                          ? money(p.priceFrom)
                          : "Chưa có giá"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
              <Pagination
                page={page}
                total={resource.data?.total || 0}
                limit={12}
                onChange={(p) => update("page", String(p))}
              />
            </>
          )}
        </div>
      </section>
    </>
  );
}
