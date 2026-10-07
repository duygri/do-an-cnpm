import { CartItem } from '../../types';

export interface OwnedCart {
  owner: string;
  items: CartItem[];
}

export interface StoredCart {
  items: CartItem[];
  guestHandoff?: { guestSnapshot: string | null };
}

export interface GuestHandoff {
  owner: string;
  persisted: boolean;
  guestSnapshot: string | null;
}

export interface CartPersistence {
  readCart(owner: string): CartItem[];
  readStoredCart(owner: string): StoredCart | null;
  readPersistedGuestHandoff(): GuestHandoff | null;
  writeCart(cart: OwnedCart, handoff: GuestHandoff | null): boolean;
  removeCart(owner: string): boolean;
}
