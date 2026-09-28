import { Request } from 'express';
import { CustomerProfile } from './customer-profile';

export interface CustomerAuthenticatedRequest extends Request {
  customer: CustomerProfile;
}
