import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { api } from '../services/api';
import { setActiveActorToken } from '../services/http';
import { CustomerProfile, EmployeeProfile } from '../types';

const CUSTOMER_TOKEN_KEY = 'customer_token';
const CUSTOMER_PROFILE_KEY = 'customer_profile';
const EMPLOYEE_TOKEN_KEY = 'employee_token';
const EMPLOYEE_PROFILE_KEY = 'employee_profile';
const UNAUTHORIZED_EVENT = 'indigo:auth-unauthorized';

interface AuthContextType {
  customer: CustomerProfile | null;
  employee: EmployeeProfile | null;
  customerLoading: boolean;
  employeeLoading: boolean;
  customerRestoreError: string | null;
  employeeRestoreError: string | null;
  customerLogin: (token: string, profile: CustomerProfile) => void;
  customerLogout: () => void;
  refreshCustomerProfile: () => Promise<CustomerProfile | null>;
  employeeLogin: (token: string, profile: EmployeeProfile) => void;
  employeeLogout: () => void;
  refreshEmployeeProfile: () => Promise<EmployeeProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeCustomerProfile(profile: CustomerProfile): CustomerProfile {
  return {
    ...profile,
    fullName: profile.name ?? profile.fullName,
    phoneNumber: profile.phone ?? profile.phoneNumber,
  };
}

function readStoredProfile<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : null;
  } catch {
    return null;
  }
}

function hasStoredToken(key: string): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage.getItem(key));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Không thể xác minh phiên đăng nhập. Vui lòng thử lại.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode; scope?: 'customer' | 'employee' | 'all' }> = ({ children, scope = 'all' }) => {
  const [customer, setCustomer] = useState<CustomerProfile | null>(() => {
    if (scope === 'employee' || !hasStoredToken(CUSTOMER_TOKEN_KEY)) return null;
    const saved = readStoredProfile<CustomerProfile>(CUSTOMER_PROFILE_KEY);
    return saved ? normalizeCustomerProfile(saved) : null;
  });
  const [employee, setEmployee] = useState<EmployeeProfile | null>(() => {
    if (scope === 'customer' || !hasStoredToken(EMPLOYEE_TOKEN_KEY)) return null;
    return readStoredProfile<EmployeeProfile>(EMPLOYEE_PROFILE_KEY);
  });
  const [customerLoading, setCustomerLoading] = useState(() => scope !== 'employee' && hasStoredToken(CUSTOMER_TOKEN_KEY));
  const [employeeLoading, setEmployeeLoading] = useState(() => scope !== 'customer' && hasStoredToken(EMPLOYEE_TOKEN_KEY));
  const [customerRestoreError, setCustomerRestoreError] = useState<string | null>(null);
  const [employeeRestoreError, setEmployeeRestoreError] = useState<string | null>(null);
  const customerOperation = useRef(0);
  const employeeOperation = useRef(0);

  const customerLogout = useCallback(() => {
    customerOperation.current += 1;
    setActiveActorToken('customer', null);
    window.localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    window.localStorage.removeItem(CUSTOMER_PROFILE_KEY);
    setCustomer(null);
    setCustomerLoading(false);
    setCustomerRestoreError(null);
  }, []);

  const employeeLogout = useCallback(() => {
    employeeOperation.current += 1;
    setActiveActorToken('employee', null);
    window.localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
    window.localStorage.removeItem(EMPLOYEE_PROFILE_KEY);
    setEmployee(null);
    setEmployeeLoading(false);
    setEmployeeRestoreError(null);
  }, []);

  const customerLogin = useCallback((token: string, profile: CustomerProfile) => {
    customerOperation.current += 1;
    const normalized = normalizeCustomerProfile(profile);
    window.localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(normalized));
    window.localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
    setActiveActorToken('customer', token);
    setCustomer(normalized);
    setCustomerLoading(false);
    setCustomerRestoreError(null);
  }, []);

  const employeeLogin = useCallback((token: string, profile: EmployeeProfile) => {
    employeeOperation.current += 1;
    window.localStorage.setItem(EMPLOYEE_PROFILE_KEY, JSON.stringify(profile));
    window.localStorage.setItem(EMPLOYEE_TOKEN_KEY, token);
    setActiveActorToken('employee', token);
    setEmployee(profile);
    setEmployeeLoading(false);
    setEmployeeRestoreError(null);
  }, []);

  const refreshCustomerProfile = useCallback(async (): Promise<CustomerProfile | null> => {
    if (scope === 'employee') return null;
    const requestToken = window.localStorage.getItem(CUSTOMER_TOKEN_KEY);
    if (!requestToken) {
      customerLogout();
      return null;
    }

    const operation = ++customerOperation.current;
    setCustomerLoading(true);
    setCustomerRestoreError(null);
    try {
      const profile = normalizeCustomerProfile(await api.getCustomerProfile());
      if (operation !== customerOperation.current || window.localStorage.getItem(CUSTOMER_TOKEN_KEY) !== requestToken) return null;
      setActiveActorToken('customer', requestToken);
      window.localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
      setCustomer(profile);
      return profile;
    } catch (error) {
      if (operation !== customerOperation.current || window.localStorage.getItem(CUSTOMER_TOKEN_KEY) !== requestToken) return null;
      setCustomerRestoreError(errorMessage(error));
      throw error;
    } finally {
      if (operation === customerOperation.current) setCustomerLoading(false);
    }
  }, [scope, customerLogout]);

  const refreshEmployeeProfile = useCallback(async (): Promise<EmployeeProfile | null> => {
    if (scope === 'customer') return null;
    const requestToken = window.localStorage.getItem(EMPLOYEE_TOKEN_KEY);
    if (!requestToken) {
      employeeLogout();
      return null;
    }

    const operation = ++employeeOperation.current;
    setEmployeeLoading(true);
    setEmployeeRestoreError(null);
    try {
      const profile = await api.getEmployeeProfile();
      if (operation !== employeeOperation.current || window.localStorage.getItem(EMPLOYEE_TOKEN_KEY) !== requestToken) return null;
      setActiveActorToken('employee', requestToken);
      window.localStorage.setItem(EMPLOYEE_PROFILE_KEY, JSON.stringify(profile));
      setEmployee(profile);
      return profile;
    } catch (error) {
      if (operation !== employeeOperation.current || window.localStorage.getItem(EMPLOYEE_TOKEN_KEY) !== requestToken) return null;
      setEmployeeRestoreError(errorMessage(error));
      throw error;
    } finally {
      if (operation === employeeOperation.current) setEmployeeLoading(false);
    }
  }, [scope, employeeLogout]);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      const owner = (event as CustomEvent<{ owner?: 'customer' | 'employee' }>).detail?.owner;
      if (owner === 'customer' && scope !== 'employee') customerLogout();
      if (owner === 'employee' && scope !== 'customer') employeeLogout();
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [scope, customerLogout, employeeLogout]);

  useEffect(() => {
    if (scope !== 'employee') {
      setActiveActorToken('customer', window.localStorage.getItem(CUSTOMER_TOKEN_KEY));
    }
    if (scope !== 'customer') {
      setActiveActorToken('employee', window.localStorage.getItem(EMPLOYEE_TOKEN_KEY));
    }
    return () => {
      if (scope !== 'employee') setActiveActorToken('customer', undefined);
      if (scope !== 'customer') setActiveActorToken('employee', undefined);
    };
  }, [scope]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== window.localStorage) return;

      const changedKeys = event.key === null
        ? [CUSTOMER_TOKEN_KEY, EMPLOYEE_TOKEN_KEY]
        : [event.key];

      if (scope !== 'employee' && changedKeys.includes(CUSTOMER_TOKEN_KEY)) {
        setActiveActorToken('customer', null);
        if (!hasStoredToken(CUSTOMER_TOKEN_KEY)) {
          customerLogout();
        } else {
          customerOperation.current += 1;
          setCustomer(null);
          setCustomerLoading(true);
          setCustomerRestoreError(null);
          void refreshCustomerProfile().catch(() => undefined);
        }
      }

      if (scope !== 'customer' && changedKeys.includes(EMPLOYEE_TOKEN_KEY)) {
        setActiveActorToken('employee', null);
        if (!hasStoredToken(EMPLOYEE_TOKEN_KEY)) {
          employeeLogout();
        } else {
          employeeOperation.current += 1;
          setEmployee(null);
          setEmployeeLoading(true);
          setEmployeeRestoreError(null);
          void refreshEmployeeProfile().catch(() => undefined);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [scope, customerLogout, employeeLogout, refreshCustomerProfile, refreshEmployeeProfile]);

  useEffect(() => {
    if (scope !== 'employee') {
      if (hasStoredToken(CUSTOMER_TOKEN_KEY)) {
        void refreshCustomerProfile().catch(() => undefined);
      } else {
        window.localStorage.removeItem(CUSTOMER_PROFILE_KEY);
        setCustomer(null);
        setCustomerLoading(false);
      }
    }

    if (scope !== 'customer') {
      if (hasStoredToken(EMPLOYEE_TOKEN_KEY)) {
        void refreshEmployeeProfile().catch(() => undefined);
      } else {
        window.localStorage.removeItem(EMPLOYEE_PROFILE_KEY);
        setEmployee(null);
        setEmployeeLoading(false);
      }
    }
  }, [scope, refreshCustomerProfile, refreshEmployeeProfile]);

  return (
    <AuthContext.Provider
      value={{
        customer,
        employee,
        customerLoading,
        employeeLoading,
        customerRestoreError,
        employeeRestoreError,
        customerLogin,
        customerLogout,
        refreshCustomerProfile,
        employeeLogin,
        employeeLogout,
        refreshEmployeeProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
