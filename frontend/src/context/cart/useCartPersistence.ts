import { useMemo } from 'react';
import { CartItem } from '../../types';
import { CartPersistence, GuestHandoff, OwnedCart, StoredCart } from './cart-types';

const CART_STORAGE_PREFIX = 'indigo_cart_v2';
type CartWriteObserver = (cart: OwnedCart, serialized: string) => void;
const writeObservers = new WeakMap<CartPersistence, CartWriteObserver>();

export function cartStorageKey(owner: string): string {
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

export function parseStoredCart(saved: string): StoredCart | null {
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

// Receipts compare the original bytes, including legacy or invalid snapshots.
export function readCartSnapshot(owner: string): string | null {
  return window.localStorage.getItem(cartStorageKey(owner));
}

// Order operations distinguish a missing cart from unreadable/invalid storage.
// Ordinary cart reads keep their separate empty-cart fallback below.
function readStoredCart(owner: string): StoredCart | null {
  const saved = readCartSnapshot(owner);
  if (saved === null) return null;
  const record = parseStoredCart(saved);
  if (!record) throw new Error('Stored cart is invalid');
  return record;
}

function readCart(owner: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = readCartSnapshot(owner);
    if (!saved) return [];
    return parseStoredCart(saved)?.items ?? [];
  } catch {
    return [];
  }
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

// Notify only after setItem returns, before read-back can fail. The observer
// keeps handoff-owned refs current without changing the persistence interface.
export function observeCartWrites(persistence: CartPersistence, observer: CartWriteObserver): void {
  writeObservers.set(persistence, observer);
}

export function useCartPersistence(): CartPersistence {
  return useMemo(() => {
    const persistence: CartPersistence = {
      readCart,
      readStoredCart,
      readPersistedGuestHandoff,
      writeCart(cart, handoff) {
        try {
          // Items and the handoff receipt share one atomic localStorage write.
          const serialized = JSON.stringify(handoff
            ? { items: cart.items, guestHandoff: { guestSnapshot: handoff.guestSnapshot } }
            : cart.items);
          const key = cartStorageKey(cart.owner);
          window.localStorage.setItem(key, serialized);
          writeObservers.get(persistence)?.(cart, serialized);
          return window.localStorage.getItem(key) === serialized;
        } catch {
          return false;
        }
      },
      removeCart(owner) {
        try {
          const key = cartStorageKey(owner);
          window.localStorage.removeItem(key);
          return window.localStorage.getItem(key) === null;
        } catch {
          return false;
        }
      },
    };
    return persistence;
  }, []);
}
