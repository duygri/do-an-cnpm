import { Request } from 'express';
import { EmployeeProfile } from './auth.types';

export interface AuthenticatedRequest extends Request {
  employee: EmployeeProfile;
}
