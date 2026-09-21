import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import type { AdminSession } from '../types';

interface AuthContextType {
  admin: AdminSession | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Validate session via httpOnly cookie — no localStorage token needed
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const result = await api.checkSession();
    if (result.success && result.data) {
      setAdmin(result.data.admin);
    } else {
      setAdmin(null);
    }
    setIsLoading(false);
  };

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    if (result.success && result.data) {
      setAdmin(result.data.admin);
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const logout = async () => {
    await api.logout();
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
