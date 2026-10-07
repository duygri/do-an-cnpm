import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { CartItem } from '../types';
import { useAuth } from './AuthContext';
import { OwnedCart } from './cart/cart-types';
import { useCartPersistence } from './cart/useCartPersistence';
import { useGuestHandoff } from './cart/useGuestHandoff';
import { useCartSync } from './cart/useCartSync';

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

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { customer } = useAuth();
  const owner = customer ? `customer-${customer.customerId}` : 'guest';
  const persistence = useCartPersistence();
  const handoff = useGuestHandoff(persistence);
  const { handoffRef, readOwnerCart, reconcileGuestItems, persistCart } = handoff;
  const [cart, setCart] = useState<OwnedCart>(() => ({ owner, items: readOwnerCart(owner) }));
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const items = cart.owner === owner ? cart.items : readOwnerCart(owner);

  useCartSync({ owner, cart, cartRef, setCart, handoff });

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
    if (handoffRef.current?.owner === owner && !handoffRef.current.persisted
      && !persistCart(cartRef.current)) return;
    const refreshed = { owner, items: owner === 'guest' && cartRef.current.owner === owner
      ? reconcileGuestItems(cartRef.current.items)
      : readOwnerCart(owner) };
    cartRef.current = refreshed;
    setCart(refreshed);
  };
  const validateOrderQuantities = (customerId: number, details: Array<{ variantId: number; quantity: number }>) => {
    const cartOwner = `customer-${customerId}`;
    let sourceItems: CartItem[];
    try {
      const record = persistence.readStoredCart(cartOwner);
      if (record === null) {
        const current = cartRef.current;
        if (current.owner !== cartOwner) return 'unavailable' as const;
        sourceItems = current.items;
        if (!persistCart(current)) return 'unavailable' as const;
      } else {
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
      const record = persistence.readStoredCart(orderOwner);
      if (record !== null) {
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
