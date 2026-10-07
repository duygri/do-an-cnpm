import { MutableRefObject, useCallback, useMemo, useRef } from 'react';
import { CartItem } from '../../types';
import { CartPersistence, GuestHandoff, OwnedCart } from './cart-types';
import { observeCartWrites, parseStoredCart, readCartSnapshot } from './useCartPersistence';

export interface GuestHandoffController {
  handoffRef: MutableRefObject<GuestHandoff | null>;
  readOwnerCart(owner: string): CartItem[];
  reconcileGuestItems(items: CartItem[]): CartItem[];
  prepareCustomerCart(owner: string, guestItems: CartItem[]): CartItem[];
  persistCart(cart: OwnedCart): boolean;
}

export function useGuestHandoff(persistence: CartPersistence): GuestHandoffController {
  const handoffRef = useRef<GuestHandoff | null>(null);
  const lastPersistedGuestSnapshotRef = useRef<string | null>(null);
  const lastVisibleGuestBaselineRef = useRef<CartItem[]>([]);
  const onCartWritten = useCallback((cart: OwnedCart, serialized: string) => {
    if (cart.owner === 'guest') {
      lastPersistedGuestSnapshotRef.current = serialized;
      lastVisibleGuestBaselineRef.current = cart.items;
    }
  }, []);
  observeCartWrites(persistence, onCartWritten);

  const refreshPersistedGuestSnapshot = useCallback(() => {
    try {
      lastPersistedGuestSnapshotRef.current = readCartSnapshot('guest');
    } catch {
      // Retain the exact last readable/successfully written snapshot during outages.
    }
    return lastPersistedGuestSnapshotRef.current;
  }, []);

  const readOwnerCart = useCallback((owner: string) => {
    handoffRef.current ??= persistence.readPersistedGuestHandoff();
    if (owner === 'guest') refreshPersistedGuestSnapshot();
    if (owner === 'guest' && handoffRef.current?.persisted) {
      try {
        const guest = readCartSnapshot('guest');
        if (guest === null || guest === handoffRef.current.guestSnapshot) {
          lastVisibleGuestBaselineRef.current = [];
          return [];
        }
      } catch {
        lastVisibleGuestBaselineRef.current = [];
        return [];
      }
    }
    const storedItems = persistence.readCart(owner);
    if (owner === 'guest') lastVisibleGuestBaselineRef.current = storedItems;
    return storedItems;
  }, [persistence, refreshPersistedGuestSnapshot]);

  const reconcileGuestItems = useCallback((currentItems: CartItem[]) => {
    // Rebase local unsaved quantity changes on the latest storage contents.
    // A receipt from another tab consumes the persisted baseline, not local additions.
    const previousBaseline = lastVisibleGuestBaselineRef.current;
    handoffRef.current ??= persistence.readPersistedGuestHandoff();
    const latestSnapshot = refreshPersistedGuestSnapshot();
    let latestBaseline: CartItem[] = [];
    try {
      latestBaseline = latestSnapshot ? parseStoredCart(latestSnapshot)?.items ?? [] : [];
    } catch {
      // Invalid persisted carts are treated as empty, matching ordinary cart reads.
    }
    if (handoffRef.current?.persisted
      && latestSnapshot === handoffRef.current.guestSnapshot) latestBaseline = [];

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
  }, [persistence, refreshPersistedGuestSnapshot]);

  const consumePersistedGuest = useCallback(() => {
    const handoff = handoffRef.current;
    if (!handoff?.persisted) return true;
    try {
      const guest = readCartSnapshot('guest');
      if (guest !== null && guest === handoff.guestSnapshot) {
        if (!persistence.removeCart('guest')) return false;
        lastPersistedGuestSnapshotRef.current = null;
        lastVisibleGuestBaselineRef.current = [];
      }
      // Keep the durable receipt until the stale guest snapshot is consumed.
      // A different snapshot belongs to a later guest cart and must be preserved.
      const saved = readCartSnapshot(handoff.owner);
      const record = saved ? parseStoredCart(saved) : null;
      if (record?.guestHandoff?.guestSnapshot === handoff.guestSnapshot) {
        if (!persistence.writeCart({ owner: handoff.owner, items: record.items }, null)) return false;
      }
      handoffRef.current = null;
      return true;
    } catch {
      return false;
    }
  }, [persistence]);

  const persistCart = useCallback((cart: OwnedCart) => {
    // A saved handoff must be consumed before this tab writes a new guest cart.
    if (cart.owner === 'guest' && !consumePersistedGuest()) return false;
    const handoff = handoffRef.current?.owner === cart.owner ? handoffRef.current : null;
    // A failed write leaves the handoff pending and the in-memory cart usable.
    if (!persistence.writeCart(cart, handoff)) return false;
    if (handoffRef.current?.owner === cart.owner) {
      handoffRef.current.persisted = true;
      consumePersistedGuest();
    }
    return true;
  }, [persistence, consumePersistedGuest]);

  const prepareCustomerCart = useCallback((owner: string, guestItems: CartItem[]) => {
    const customerItems = persistence.readCart(owner);
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
    handoffRef.current = { owner, persisted: false, guestSnapshot: refreshPersistedGuestSnapshot() };
    return merged;
  }, [persistence, refreshPersistedGuestSnapshot]);

  return useMemo(() => ({ handoffRef, readOwnerCart, reconcileGuestItems, prepareCustomerCart, persistCart }),
    [readOwnerCart, reconcileGuestItems, prepareCustomerCart, persistCart]);
}
