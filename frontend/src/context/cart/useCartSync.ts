import { Dispatch, MutableRefObject, SetStateAction, useEffect } from 'react';
import { OwnedCart } from './cart-types';
import { cartStorageKey } from './useCartPersistence';
import { GuestHandoffController } from './useGuestHandoff';

export interface CartSyncOptions {
  owner: string;
  cart: OwnedCart;
  cartRef: MutableRefObject<OwnedCart>;
  setCart: Dispatch<SetStateAction<OwnedCart>>;
  handoff: GuestHandoffController;
}

export function useCartSync({ owner, cart, cartRef, setCart, handoff }: CartSyncOptions): void {
  const { handoffRef, readOwnerCart, reconcileGuestItems, prepareCustomerCart, persistCart } = handoff;

  useEffect(() => {
    if (cart.owner !== owner) {
      const previous = cartRef.current;
      if (handoffRef.current?.owner === previous.owner) persistCart(previous);
      const isGuestLogin = previous.owner === 'guest' && owner.startsWith('customer-');
      const guestItems = isGuestLogin ? reconcileGuestItems(previous.items) : [];
      const items = isGuestLogin
        ? prepareCustomerCart(owner, guestItems)
        : readOwnerCart(owner);
      const next = { owner, items };
      persistCart(next);
      cartRef.current = next;
      setCart(next);
      return;
    }
    persistCart(cart);
  }, [cart, owner, cartRef, setCart, handoffRef, persistCart, reconcileGuestItems, prepareCustomerCart, readOwnerCart]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== cartStorageKey(owner)) return;
      if (handoffRef.current?.owner === owner && !handoffRef.current.persisted
        && !persistCart(cartRef.current)) return;
      const refreshed = { owner, items: owner === 'guest' && cartRef.current.owner === owner
        ? reconcileGuestItems(cartRef.current.items)
        : readOwnerCart(owner) };
      cartRef.current = refreshed;
      setCart(refreshed);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [owner, cartRef, setCart, handoffRef, persistCart, reconcileGuestItems, readOwnerCart]);
}
