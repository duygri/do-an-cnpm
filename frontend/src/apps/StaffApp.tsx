import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { StaffRoute } from '../components/auth/StaffRoute';
import { EmployeeLoginPage } from '../pages/auth/EmployeeLoginPage';
import { AdminPortal } from '../pages/admin/AdminPortal';

export const StaffApp: React.FC = () => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <AuthProvider scope="employee">
      <main className="min-h-screen bg-canvas text-on-surface">
        <Routes>
          <Route path="/employee/login" element={<EmployeeLoginPage basePath="/staff" />} />
          <Route path="/staff/*" element={<StaffRoute><AdminPortal basePath="/staff" /></StaffRoute>} />
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </Routes>
      </main>
    </AuthProvider>
  </BrowserRouter>
);

export default StaffApp;
