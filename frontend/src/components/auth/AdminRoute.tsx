import React, { ReactNode } from 'react';
import { EmployeeRoute } from './EmployeeRoute';

export const AdminRoute: React.FC<{ children?: ReactNode }> = ({ children }) => (
  <EmployeeRoute portal="admin">{children}</EmployeeRoute>
);
