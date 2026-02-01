import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { isTokenExpired } from '../hooks/useIdleTimeout';

interface Admin {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'support';
  permissions: Record<string, boolean>;
}

interface AuthContextType {
  admin: Admin | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      if (isTokenExpired(token)) {
        localStorage.removeItem('admin_token');
        api.clearToken();
        setIsLoading(false);
        return;
      }
      api.setToken(token);
      loadProfile();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadProfile = async () => {
    const result = await api.getProfile();
    if (result.success && result.data) {
      setAdmin(result.data.admin);
    } else {
      localStorage.removeItem('admin_token');
      api.clearToken();
    }
    setIsLoading(false);
  };

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    if (result.success && result.data) {
      localStorage.setItem('admin_token', result.data.token);
      api.setToken(result.data.token);
      setAdmin(result.data.admin);
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const logout = () => {
    localStorage.removeItem('admin_token');
    api.clearToken();
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
