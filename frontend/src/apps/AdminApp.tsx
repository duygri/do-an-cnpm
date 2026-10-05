import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { AdminRoute } from '../components/auth/AdminRoute';
import { EmployeeLoginPage } from '../pages/auth/EmployeeLoginPage';
import { AdminPortal } from '../pages/admin/AdminPortal';

export const AdminApp: React.FC = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AuthProvider scope="employee">
      <main className="min-h-screen bg-canvas text-on-surface">
        <Routes>
          <Route path="/employee/login" element={<EmployeeLoginPage basePath="/admin" />} />
          <Route path="/admin/*" element={<AdminRoute><AdminPortal basePath="/admin" /></AdminRoute>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </AuthProvider>
  </BrowserRouter>
);

export default AdminApp;
