import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CartProvider } from '../context/CartContext';
import { AuthProvider } from '../context/AuthContext';
import { CustomerRoute } from '../components/auth/CustomerRoute';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { HomePage } from '../pages/storefront/HomePage';
import { ProductDetailPage } from '../pages/storefront/ProductDetailPage';
import { NotFoundPage } from '../pages/storefront/NotFoundPage';
import { CartPage } from '../pages/storefront/CartPage';
import { OrderHistoryPage } from '../pages/storefront/OrderHistoryPage';
import { OrderDetailPage } from '../pages/storefront/OrderDetailPage';
import { CustomerLoginPage } from '../pages/auth/CustomerLoginPage';
import { CustomerRegisterPage } from '../pages/auth/CustomerRegisterPage';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

const AppLayout: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const searchQuery = useDebouncedValue(searchInput, 300);

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-on-surface">
      <Navbar onSearch={setSearchInput} />
      <main className="flex-1 pt-36">
        <Routes>
          <Route path="/" element={<HomePage searchQuery={searchQuery} />} />
          <Route path="/product/:id" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/login" element={<CustomerLoginPage />} />
          <Route path="/register" element={<CustomerRegisterPage />} />
          <Route path="/orders" element={<CustomerRoute><OrderHistoryPage /></CustomerRoute>} />
          <Route path="/orders/:orderId" element={<CustomerRoute><OrderDetailPage /></CustomerRoute>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
};

export const UserApp: React.FC = () => {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider scope="customer">
        <CartProvider>
          <AppLayout />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default UserApp;
