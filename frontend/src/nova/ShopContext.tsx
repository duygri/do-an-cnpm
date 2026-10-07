import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, session } from "./api";
import type {
  AuthResponse,
  CartItem,
  Customer,
  Product,
  Variant,
} from "./types";
const CART = "nova-cart-v2";
export function sanitizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value
    .filter((x): x is CartItem => {
      if (!x || typeof x !== "object") return false;
      const valid =
        [x.productId, x.variantId, x.quantity].every(
          (n) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647,
        ) && !seen.has(x.variantId);
      if (valid) seen.add(x.variantId);
      return valid;
    })
    .slice(0, 100)
    .map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity,
    }));
}
function initialCart() {
  try {
    return sanitizeCart(JSON.parse(localStorage.getItem(CART) || "[]"));
  } catch {
    return [];
  }
}
interface Shop {
  cart: CartItem[];
  customer: Customer | null;
  authLoading: boolean;
  authError: string;
  cartCount: number;
  setQuantity: (id: number, q: number) => void;
  add: (item: CartItem) => void;
  remove: (id: number) => void;
  removePurchased: (items: CartItem[]) => void;
  authenticate: (path: "login" | "register", body: unknown) => Promise<void>;
  updateCustomer: (customer: Customer) => void;
  logout: () => void;
}
const Context = createContext<Shop | null>(null);
export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState(initialCart);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [authLoading, setLoading] = useState(true);
  const [authError, setError] = useState("");
  const epoch = useRef(0);
  useEffect(() => {
    try {
      localStorage.setItem(CART, JSON.stringify(cart));
    } catch {
      /* Cart remains usable in memory when storage is unavailable. */
    }
  }, [cart]);
  useEffect(() => {
    let active = true;
    const token = session.get();
    const start = epoch.current;
    const expired = () => {
      epoch.current++;
      setCustomer(null);
      setLoading(false);
      setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    };
    window.addEventListener("nova-session-expired", expired);
    if (token)
      api<Customer>("/auth/customer/profile")
        .then((c) => {
          if (active && epoch.current === start) setCustomer(c);
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    else setLoading(false);
    return () => {
      active = false;
      window.removeEventListener("nova-session-expired", expired);
    };
  }, []);
  const value: Shop = {
    cart,
    customer,
    authLoading,
    authError,
    cartCount: cart.reduce((n, x) => n + x.quantity, 0),
    setQuantity: (id, q) => {
      if (Number.isSafeInteger(q) && q > 0 && q <= 2147483647)
        setCart((old) =>
          old.map((x) => (x.variantId === id ? { ...x, quantity: q } : x)),
        );
    },
    add: (item) =>
      setCart((old) => {
        const found = old.find((x) => x.variantId === item.variantId);
        return sanitizeCart(
          found
            ? old.map((x) =>
                x.variantId === item.variantId
                  ? {
                      ...x,
                      quantity: Math.min(
                        2147483647,
                        x.quantity + item.quantity,
                      ),
                    }
                  : x,
              )
            : [...old, item],
        );
      }),
    remove: (id) => setCart((old) => old.filter((x) => x.variantId !== id)),
    removePurchased: (items) =>
      setCart((old) =>
        old.flatMap((x) => {
          const bought = items.find((i) => i.variantId === x.variantId);
          return bought
            ? x.quantity > bought.quantity
              ? [{ ...x, quantity: x.quantity - bought.quantity }]
              : []
            : [x];
        }),
      ),
    authenticate: async (path, body) => {
      const result = await api<AuthResponse>("/auth/customer/" + path, {
        method: "POST",
        body,
        auth: false,
      });
      epoch.current++;
      session.set(result.access_token);
      setCustomer(result.customer);
      setError("");
    },
    updateCustomer: setCustomer,
    logout: () => {
      // Revoke the server refresh cookie; local sign-out must also work offline.
      void api("/auth/customer/logout", { method: "POST", auth: false }).catch(
        () => {},
      );
      epoch.current++;
      session.clear();
      setCustomer(null);
      setError("");
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useShop() {
  const value = useContext(Context);
  if (!value) throw new Error("ShopProvider required");
  return value;
}
export interface ResolvedLine extends CartItem {
  product?: Product;
  variant?: Variant;
  error?: string;
}
export function useCartProducts() {
  const { cart } = useShop();
  const key = JSON.stringify(cart);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    loading: boolean;
    lines: ResolvedLine[];
  }>({ key, loading: true, lines: [] });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const items: CartItem[] = JSON.parse(key);
    setState({ key, loading: true, lines: [] });
    const requests = new Map(
      items.map((x) => [
        x.productId,
        undefined as Promise<Product> | undefined,
      ]),
    );
    for (const id of requests.keys())
      requests.set(
        id,
        api<Product>("/store/products/" + id, { signal: controller.signal }),
      );
    Promise.all(
      items.map(async (item) => {
        try {
          const product = await requests.get(item.productId)!;
          const variant = product.variants.find(
            (v) => v.variantId === item.variantId,
          );
          return {
            ...item,
            product,
            variant,
            error: variant ? undefined : "Biến thể này không còn mua được.",
          };
        } catch (e) {
          return {
            ...item,
            error: e instanceof Error ? e.message : "Không tải được sản phẩm.",
          };
        }
      }),
    ).then((lines) => {
      if (active) setState({ key, loading: false, lines });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [key, revision]);
  return {
    ...(state.key === key ? state : { key, loading: true, lines: [] }),
    reload: () => setRevision((v) => v + 1),
  };
}
