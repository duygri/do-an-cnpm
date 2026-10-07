import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cents, decimal, money } from "../src/nova/money";
import { sanitizeCart } from "../src/nova/ShopContext";
import { api, session, ApiError } from "../src/nova/api";
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("keeps large money and fractional values exact", () => {
  expect(decimal(cents("9999999999999999999999.99") * 3n)).toBe(
    "29999999999999999999999.97",
  );
  expect(money("1.25")).toBe("1,25 ₫");
});
it("validates persisted cart data and strips unknown fields", () => {
  expect(
    sanitizeCart([
      { productId: 1, variantId: 2, quantity: 3, price: 0 },
      { productId: 1, variantId: 2, quantity: 1 },
      { productId: 2, variantId: 3, quantity: -1 },
      null,
    ]),
  ).toEqual([{ productId: 1, variantId: 2, quantity: 3 }]);
});
it("sends the session customer token and JSON body", async () => {
  session.set("customer");
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ orderId: 7 })));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await api("/orders", { method: "POST", body: { paymentMethod: "cod" } }),
  ).toEqual({ orderId: 7 });
  expect(fetcher.mock.calls[0][0]).toBe("/api/orders");
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer customer",
  );
});
it("clears only the failed active session on 401", async () => {
  session.set("old");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
  );
  await expect(api("/orders")).rejects.toMatchObject({ status: 401 });
  expect(session.get()).toBeNull();
});
it("a stale unauthorized response cannot clear a new session", async () => {
  session.set("old");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      session.set("new");
      return new Response("{}", { status: 401 });
    }),
  );
  await expect(api("/orders")).rejects.toBeInstanceOf(ApiError);
  expect(session.get()).toBe("new");
});
it("does not retry uncertain COD submissions", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("Network error"));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    api("/orders", { method: "POST", body: {} }),
  ).rejects.toMatchObject({ uncertain: true });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("reports voucher errors without turning them into uncertain submissions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: ["Voucher hết lượt"] }), {
        status: 400,
      }),
    ),
  );
  await expect(
    api("/orders", { method: "POST", body: {} }),
  ).rejects.toMatchObject({ message: "Voucher hết lượt", uncertain: false });
});

it("aborts after 25 seconds without retrying COD", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = expect(
    api("/orders", { method: "POST", body: {} }),
  ).rejects.toMatchObject({ uncertain: true });
  await vi.advanceTimersByTimeAsync(25000);
  await result;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
