import { test, expect, Page } from "@playwright/test";
const customer = {
  customerId: 1,
  name: "Khách kiểm thử",
  email: "shop@example.test",
  phone: "0901234567",
  address: "12 Nguyễn Huệ",
  gender: null,
  dateOfBirth: null,
};
const product = {
  productId: 1,
  name: "Shadow Box Tee",
  description: "Áo tee phom boxy từ cotton compact.",
  brand: "NOVA",
  category: { categoryId: 1, name: "Tees" },
  images: [],
  variants: [
    { variantId: 10, color: "Onyx", size: "M", price: "489000.00" },
    { variantId: 11, color: "Bone", size: "L", price: "519000.00" },
  ],
};
const order = {
  orderId: 8,
  orderDate: "2026-10-07T00:00:00Z",
  status: "pending",
  paymentStatus: "unpaid",
  paymentMethod: "cod",
  recipientName: customer.name,
  recipientPhone: customer.phone,
  shippingAddress: customer.address,
  note: null,
  voucherCode: null,
  discountAmount: "0.00",
  shippingFee: "0.00",
  totalAmount: "489000.00",
  details: [
    {
      variantId: 10,
      quantity: 1,
      unitPrice: "489000.00",
      subtotal: "489000.00",
    },
  ],
};
async function fixture(
  page: Page,
  opts: { uncertain?: boolean; expired?: boolean } = {},
) {
  let current = { ...order };
  const requests: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/api", "");
    let data: unknown = {};
    let status = 200;
    if (path === "/store/categories") data = [product.category];
    else if (path === "/store/products") {
      data = {
        items:
          url.searchParams.get("q") === "empty"
            ? []
            : [{ ...product, priceFrom: "489000.00", primaryImageUrl: null }],
        page: Number(url.searchParams.get("page") || 1),
        limit: 12,
        total: url.searchParams.get("q") === "empty" ? 0 : 13,
      };
    } else if (path === "/store/products/1") data = product;
    else if (
      path === "/auth/customer/login" ||
      path === "/auth/customer/register"
    )
      data = { access_token: "customer-token", expires_in: 900, customer };
    else if (path === "/auth/customer/profile") data = customer;
    else if (path === "/orders" && req.method() === "POST") {
      requests.push(req.postDataJSON());
      if (opts.uncertain) {
        await route.abort("failed");
        return;
      }
      const body = req.postDataJSON();
      if (body.voucherCode === "BAD") {
        status = 400;
        data = { message: "Voucher không hợp lệ" };
      } else {
        data = current;
      }
    } else if (path === "/orders") {
      if (opts.expired) {
        status = 401;
        data = { message: "Unauthorized" };
      } else
        data = {
          items: requests.length ? [current] : [],
          page: 1,
          limit: 10,
          total: requests.length ? 1 : 0,
        };
    } else if (path === "/orders/8/cancel") {
      current = { ...current, status: "cancelled" };
      data = current;
    } else if (path === "/orders/8") data = current;
    else {
      status = 404;
      data = { message: "Không tìm thấy" };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  return requests;
}
async function selectProduct(page: Page) {
  await page.goto("/products/1");
  await page.getByRole("button", { name: "Onyx / M" }).click();
  await page.getByRole("button", { name: "THÊM VÀO GIỎ" }).click();
  await page.goto("/cart");
  await expect(page.getByText("Shadow Box Tee", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Shadow Box Tee", { exact: true })).toBeVisible();
}
async function login(page: Page) {
  await page.getByLabel("EMAIL", { exact: true }).fill(customer.email);
  await page.getByLabel("MẬT KHẨU", { exact: true }).fill("password12345");
  await page.getByRole("button", { name: "ĐĂNG NHẬP", exact: true }).click();
}
test("catalog search, category and pagination use API; layout fits viewport", async ({
  page,
}, testInfo) => {
  await fixture(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "AFTER DARK" })).toBeVisible();
  await expect(page.getByText("Shadow Box Tee", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("img", { name: "NOVA Supply Drop 01 urban editorial" }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Mở menu" }).click();
    await expect(page.getByLabel("Tìm trong NOVA")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Tìm trong NOVA")).toBeHidden();
  } else {
    await expect(page.getByRole("button", { name: "Mở menu" })).toBeHidden();
  }
  await page.screenshot({
    path: `test-results/nova-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("DANH MỤC", { exact: true }).selectOption("1");
  await expect(page).toHaveURL(/categoryId=1/);
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.goto("/?q=empty", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Chưa có sản phẩm phù hợp.", { exact: false }),
  ).toBeVisible();
});
test("cart survives reload, login returns to checkout, voucher error then COD and cancellation", async ({
  page,
}) => {
  const requests = await fixture(page);
  await selectProduct(page);
  await page.getByRole("link", { name: "TIẾN HÀNH ĐẶT HÀNG" }).click();
  await expect(page).toHaveURL(/login/);
  await login(page);
  await expect(page).toHaveURL(/checkout/);
  await page.getByLabel("MÃ GIẢM GIÁ (TÙY CHỌN)").fill("BAD");
  await page.getByRole("button", { name: "ĐẶT HÀNG COD" }).click();
  await expect(page.getByRole("alert")).toContainText("Voucher không hợp lệ");
  await page.getByLabel("MÃ GIẢM GIÁ (TÙY CHỌN)").fill("");
  await page.getByRole("button", { name: "ĐẶT HÀNG COD" }).click();
  await expect(page).toHaveURL("/account/orders/8");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    paymentMethod: "cod",
    details: [{ variantId: 10, quantity: 1 }],
  });
  expect(requests[1]).not.toHaveProperty("totalAmount");
  await page.getByRole("button", { name: "HỦY ĐƠN HÀNG", exact: true }).click();
  await page.getByRole("button", { name: "XÁC NHẬN HỦY" }).click();
  await expect(page.getByText("Đã hủy", { exact: true })).toBeVisible();
  await page.goto("/cart");
  await expect(
    page.getByText("Giỏ hàng đang trống.", { exact: false }),
  ).toBeVisible();
});
test("uncertain COD is not retried, including after reload", async ({
  page,
}) => {
  const requests = await fixture(page, { uncertain: true });
  await selectProduct(page);
  await page.getByRole("link", { name: "TIẾN HÀNH ĐẶT HÀNG" }).click();
  await login(page);
  await page.getByRole("button", { name: "ĐẶT HÀNG COD" }).click();
  await expect(
    page.getByRole("button", { name: "ĐẶT HÀNG COD" }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "ĐẶT HÀNG COD" }),
  ).toBeDisabled();
  expect(requests).toHaveLength(1);
});
test("401 requires login without discarding the cart", async ({ page }) => {
  await fixture(page, { expired: true });
  await selectProduct(page);
  await page.goto("/login");
  await login(page);
  await page.goto("/account/orders");
  await expect(page).toHaveURL(/login/);
  await page.goto("/cart");
  await expect(page.getByText("Shadow Box Tee", { exact: true })).toBeVisible();
});

test("unavailable variant blocks checkout until removed", async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "nova-cart-v2",
      JSON.stringify([{ productId: 1, variantId: 999, quantity: 1 }]),
    ),
  );
  await page.goto("/cart");
  await expect(
    page.getByText("Biến thể này không còn mua được."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "TIẾN HÀNH ĐẶT HÀNG" }),
  ).toHaveCount(0);
});
