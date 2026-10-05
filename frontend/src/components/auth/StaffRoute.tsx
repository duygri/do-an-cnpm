import React, { ReactNode } from 'react';
import { EmployeeRoute } from './EmployeeRoute';

export const StaffRoute: React.FC<{ children?: ReactNode }> = ({ children }) => (
  <EmployeeRoute portal="staff">{children}</EmployeeRoute>
);
