import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CartItem } from '../types';
import { useAuth } from './AuthContext';

interface CartContextType {
  items: CartItem[];
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  removeFromCart: (variantId: number) => void;
  updateQuantity: (variantId: number, delta: number) => void;
  clearCart: () => void;
  removeOrderedQuantities: (customerId: number, details: Array<{ variantId: number; quantity: number }>) => boolean;
  refreshFromStorage: () => void;
  validateOrderQuantities: (customerId: number, details: Array<{ variantId: number; quantity: number }>) => 'valid' | 'changed' | 'unavailable';
  totalCount: number;
}

interface OwnedCart {
  owner: string;
  items: CartItem[];
}

interface StoredCart {
  items: CartItem[];
  guestHandoff?: { guestSnapshot: string | null };
}

interface GuestHandoff {
  owner: string;
  persisted: boolean;
  guestSnapshot: string | null;
}

const CART_STORAGE_PREFIX = 'indigo_cart_v2';
const CartContext = createContext<CartContextType | undefined>(undefined);

function cartStorageKey(owner: string): string {
  return `${CART_STORAGE_PREFIX}:${owner}`;
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CartItem>;
  return Number.isSafeInteger(item.productId) && Number(item.productId) > 0
    && Number.isSafeInteger(item.variantId) && Number(item.variantId) > 0
    && typeof item.name === 'string'
    && (typeof item.size === 'string' || item.size === null)
    && (typeof item.color === 'string' || item.color === null)
    && typeof item.price === 'string' && /^\d+(?:\.\d{1,2})?$/.test(item.price)
    && Number.isSafeInteger(item.quantity) && Number(item.quantity) > 0
    && (item.imageUrl === undefined || typeof item.imageUrl === 'string');
}

function parseStoredCart(saved: string): StoredCart | null {
  const parsed: unknown = JSON.parse(saved);
  if (Array.isArray(parsed)) return { items: parsed.filter(isCartItem) };
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Partial<StoredCart>;
  if (!Array.isArray(record.items)) return null;
  return {
    items: record.items.filter(isCartItem),
    ...(typeof record.guestHandoff?.guestSnapshot === 'string' || record.guestHandoff?.guestSnapshot === null
      ? { guestHandoff: { guestSnapshot: record.guestHandoff.guestSnapshot } }
      : {}),
  };
}

function readPersistedGuestHandoff(): GuestHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(`${CART_STORAGE_PREFIX}:customer-`)) continue;
      const saved = window.localStorage.getItem(key);
      if (!saved) continue;
      let record: StoredCart | null;
      try { record = parseStoredCart(saved); } catch { continue; }
      if (record?.guestHandoff) {
        return { owner: key.slice(CART_STORAGE_PREFIX.length + 1), persisted: true, ...record.guestHandoff };
      }
    }
  } catch {
    // Storage can be temporarily unavailable; in-memory handoffs still retry.
  }
  return null;
}

function readCart(owner: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(cartStorageKey(owner));
    if (!saved) return [];
    return parseStoredCart(saved)?.items ?? [];
  } catch {
    return [];
  }
}

function mergeGuestCartIntoCustomer(customerOwner: string, guestItems: CartItem[]): CartItem[] {
  const customerItems = readCart(customerOwner);
  if (guestItems.length === 0) return customerItems;

  const merged = [...customerItems];
  for (const guestItem of guestItems) {
    const existingIndex = merged.findIndex((item) => item.variantId === guestItem.variantId);
    if (existingIndex === -1) {
      merged.push(guestItem);
    } else {
      merged[existingIndex] = {
        ...merged[existingIndex],
        quantity: merged[existingIndex].quantity + guestItem.quantity,
      };
    }
  }

  return merged;
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { customer } = useAuth();
  const owner = customer ? `customer-${customer.customerId}` : 'guest';
  const guestHandoffRef = useRef<GuestHandoff | null>(null);
  const lastPersistedGuestSnapshotRef = useRef<string | null>(null);
  const lastVisibleGuestBaselineRef = useRef<CartItem[]>([]);
  const refreshPersistedGuestSnapshot = () => {
    try {
      lastPersistedGuestSnapshotRef.current = window.localStorage.getItem(cartStorageKey('guest'));
    } catch {
      // Retain the exact last readable/successfully written snapshot during outages.
    }
    return lastPersistedGuestSnapshotRef.current;
  };
  const readOwnerCart = (cartOwner: string) => {
    guestHandoffRef.current ??= readPersistedGuestHandoff();
    if (cartOwner === 'guest') refreshPersistedGuestSnapshot();
    if (cartOwner === 'guest' && guestHandoffRef.current?.persisted) {
      try {
        const guest = window.localStorage.getItem(cartStorageKey('guest'));
        if (guest === null || guest === guestHandoffRef.current.guestSnapshot) {
          lastVisibleGuestBaselineRef.current = [];
          return [];
        }
      } catch {
        lastVisibleGuestBaselineRef.current = [];
        return [];
      }
    }
    const storedItems = readCart(cartOwner);
    if (cartOwner === 'guest') lastVisibleGuestBaselineRef.current = storedItems;
    return storedItems;
  };
  const [cart, setCart] = useState<OwnedCart>(() => ({ owner, items: readOwnerCart(owner) }));
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const reconcileGuestItems = (currentItems: CartItem[]) => {
    // Rebase local unsaved quantity changes on the latest storage contents.
    // A receipt from another tab consumes the persisted baseline, not local additions.
    const previousBaseline = lastVisibleGuestBaselineRef.current;
    guestHandoffRef.current ??= readPersistedGuestHandoff();
    const latestSnapshot = refreshPersistedGuestSnapshot();
    let latestBaseline: CartItem[] = [];
    try {
      latestBaseline = latestSnapshot ? parseStoredCart(latestSnapshot)?.items ?? [] : [];
    } catch {
      // Invalid persisted carts are treated as empty, matching ordinary cart reads.
    }
    if (guestHandoffRef.current?.persisted
      && latestSnapshot === guestHandoffRef.current.guestSnapshot) latestBaseline = [];

    const localDeltas = new Map<number, number>();
    for (const item of currentItems) localDeltas.set(item.variantId, item.quantity);
    for (const item of previousBaseline) {
      localDeltas.set(item.variantId, (localDeltas.get(item.variantId) ?? 0) - item.quantity);
    }
    const rebased = latestBaseline.map((item) => ({
      ...item,
      quantity: item.quantity + (localDeltas.get(item.variantId) ?? 0),
    }));
    for (const item of currentItems) {
      if (!latestBaseline.some((stored) => stored.variantId === item.variantId)) {
        rebased.push({ ...item, quantity: localDeltas.get(item.variantId) ?? 0 });
      }
    }
    lastVisibleGuestBaselineRef.current = latestBaseline;
    return rebased.filter((item) => item.quantity > 0);
  };
  const consumePersistedGuest = () => {
    const handoff = guestHandoffRef.current;
    if (!handoff?.persisted) return true;
    try {
      const guestKey = cartStorageKey('guest');
      const guest = window.localStorage.getItem(guestKey);
      if (guest !== null && guest === handoff.guestSnapshot) {
        window.localStorage.removeItem(guestKey);
        if (window.localStorage.getItem(guestKey) !== null) return false;
        lastPersistedGuestSnapshotRef.current = null;
        lastVisibleGuestBaselineRef.current = [];
      }
      // Keep the durable receipt until the stale guest snapshot is consumed.
      // A different snapshot belongs to a later guest cart and must be preserved.
      const customerKey = cartStorageKey(handoff.owner);
      const saved = window.localStorage.getItem(customerKey);
      const record = saved ? parseStoredCart(saved) : null;
      if (record?.guestHandoff?.guestSnapshot === handoff.guestSnapshot) {
        const serialized = JSON.stringify(record.items);
        window.localStorage.setItem(customerKey, serialized);
        if (window.localStorage.getItem(customerKey) !== serialized) return false;
      }
      guestHandoffRef.current = null;
      return true;
    } catch {
      return false;
    }
  };
  const persistCart = (ownedCart: OwnedCart) => {
    // A saved handoff must be consumed before this tab writes a new guest cart.
    if (ownedCart.owner === 'guest' && !consumePersistedGuest()) return false;
    try {
      const handoff = guestHandoffRef.current?.owner === ownedCart.owner ? guestHandoffRef.current : null;
      // Items and the handoff receipt share one atomic localStorage write.
      const serialized = JSON.stringify(handoff
        ? { items: ownedCart.items, guestHandoff: { guestSnapshot: handoff.guestSnapshot } }
        : ownedCart.items);
      const key = cartStorageKey(ownedCart.owner);
      window.localStorage.setItem(key, serialized);
      if (ownedCart.owner === 'guest') {
        lastPersistedGuestSnapshotRef.current = serialized;
        lastVisibleGuestBaselineRef.current = ownedCart.items;
      }
      if (window.localStorage.getItem(key) !== serialized) return false;
      if (guestHandoffRef.current?.owner === ownedCart.owner) {
        guestHandoffRef.current.persisted = true;
        consumePersistedGuest();
      }
      return true;
    } catch {
      // Keep the handoff pending along with the usable in-memory cart.
      return false;
    }
  };
  const items = cart.owner === owner ? cart.items : readOwnerCart(owner);

  useEffect(() => {
    if (cart.owner !== owner) {
      const previous = cartRef.current;
      if (guestHandoffRef.current?.owner === previous.owner) persistCart(previous);
      const isGuestLogin = previous.owner === 'guest' && owner.startsWith('customer-');
      const guestItems = isGuestLogin ? reconcileGuestItems(previous.items) : [];
      const items = isGuestLogin
        ? mergeGuestCartIntoCustomer(owner, guestItems)
        : readOwnerCart(owner);
      if (isGuestLogin && guestItems.length > 0) {
        guestHandoffRef.current = { owner, persisted: false, guestSnapshot: refreshPersistedGuestSnapshot() };
      }
      const next = { owner, items };
      persistCart(next);
      cartRef.current = next;
      setCart(next);
      return;
    }
    persistCart(cart);
  }, [cart, owner]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== cartStorageKey(owner)) return;
      if (guestHandoffRef.current?.owner === owner && !guestHandoffRef.current.persisted
        && !persistCart(cartRef.current)) return;
      const refreshed = { owner, items: owner === 'guest' && cartRef.current.owner === owner
        ? reconcileGuestItems(cartRef.current.items)
        : readOwnerCart(owner) };
      cartRef.current = refreshed;
      setCart(refreshed);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [owner]);

  const setCurrentItems = (update: (current: CartItem[]) => CartItem[]) => {
    const current = cartRef.current;
    const currentItems = current.owner !== owner ? readOwnerCart(owner)
      : owner === 'guest' ? reconcileGuestItems(current.items) : current.items;
    const next = { owner, items: update(currentItems) };
    cartRef.current = next;
    setCart(next);
  };

  const addToCart = (product: Omit<CartItem, 'quantity'>, quantity = 1) => {
    setCurrentItems((previous) => {
      const existing = previous.find((item) => item.variantId === product.variantId);
      if (!existing) return [...previous, { ...product, quantity }];
      return previous.map((item) => item.variantId === product.variantId
        ? { ...product, quantity: item.quantity + quantity }
        : item);
    });
  };

  const removeFromCart = (variantId: number) => {
    setCurrentItems((previous) => previous.filter((item) => item.variantId !== variantId));
  };

  const updateQuantity = (variantId: number, delta: number) => {
    setCurrentItems((previous) => previous
      .map((item) => item.variantId === variantId
        ? { ...item, quantity: item.quantity + delta }
        : item)
      .filter((item) => item.quantity > 0));
  };

  const clearCart = () => setCurrentItems(() => []);
  const refreshFromStorage = () => {
    if (guestHandoffRef.current?.owner === owner && !guestHandoffRef.current.persisted
      && !persistCart(cartRef.current)) return;
    const refreshed = { owner, items: owner === 'guest' && cartRef.current.owner === owner
      ? reconcileGuestItems(cartRef.current.items)
      : readOwnerCart(owner) };
    cartRef.current = refreshed;
    setCart(refreshed);
  };
  const validateOrderQuantities = (customerId: number, details: Array<{ variantId: number; quantity: number }>) => {
    const cartOwner = `customer-${customerId}`;
    const key = cartStorageKey(cartOwner);
    let sourceItems: CartItem[];
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === null) {
        const current = cartRef.current;
        if (current.owner !== cartOwner) return 'unavailable' as const;
        sourceItems = current.items;
        if (!persistCart(current)) return 'unavailable' as const;
      } else {
        const record = parseStoredCart(saved);
        if (!record) return 'unavailable' as const;
        sourceItems = record.items;
      }
    } catch {
      return 'unavailable' as const;
    }
    const availableByVariant = new Map(sourceItems.map((item) => [item.variantId, item.quantity]));
    return details.every((detail) => (availableByVariant.get(detail.variantId) ?? 0) >= detail.quantity)
      ? 'valid' as const
      : 'changed' as const;
  };
  const removeOrderedQuantities = (customerId: number, details: Array<{ variantId: number; quantity: number }>) => {
    const orderOwner = `customer-${customerId}`;
    const orderedByVariant = new Map(details.map((detail) => [detail.variantId, detail.quantity]));
    let storedItems: CartItem[] | null = null;
    let storageReadable = true;
    try {
      const saved = window.localStorage.getItem(cartStorageKey(orderOwner));
      if (saved !== null) {
        const record = parseStoredCart(saved);
        if (!record) throw new Error('Stored cart is invalid');
        storedItems = record.items;
      }
    } catch {
      storageReadable = false;
    }

    const inMemory = cartRef.current;
    if (!storageReadable && inMemory.owner !== orderOwner) return false;
    const sourceItems = storedItems ?? (inMemory.owner === orderOwner ? inMemory.items : []);
    const remainingItems = sourceItems
      .map((item) => ({ ...item, quantity: item.quantity - (orderedByVariant.get(item.variantId) ?? 0) }))
      .filter((item) => item.quantity > 0);
    const persisted = persistCart({ owner: orderOwner, items: remainingItems });
    if (inMemory.owner === orderOwner) {
      const updated = { owner: orderOwner, items: remainingItems };
      cartRef.current = updated;
      setCart((current) => current.owner === orderOwner ? updated : current);
    }
    return persisted;
  };
  const totalCount = useMemo(() => items.reduce((count, item) => count + item.quantity, 0), [items]);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, removeOrderedQuantities, refreshFromStorage, validateOrderQuantities, totalCount }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};
