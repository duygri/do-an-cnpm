import { Customer } from './entities/customer.entity';

export interface CustomerProfile {
  customerId: number;
  name: string;
  email: string;
  dateOfBirth: string | null;
  phone: string | null;
  address: string | null;
  gender: string | null;
}

export function toCustomerProfile(customer: Customer): CustomerProfile {
  return {
    customerId: customer.customerId,
    name: customer.name,
    email: customer.email,
    dateOfBirth: customer.dateOfBirth,
    phone: customer.phone,
    address: customer.address,
    gender: customer.gender,
  };
}
