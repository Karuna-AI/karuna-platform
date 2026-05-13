import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { AuthState, LoginCredentials, RegisterData } from '../types';
import api from '../services/api';
import { useIdleTimeout } from '../hooks/useIdleTimeout';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    validateToken();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
    };
    window.addEventListener('karuna:auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('karuna:auth:unauthorized', handleUnauthorized);
  }, []);

  const validateToken = async () => {
    const result = await api.checkSession();
    if (result.success && result.data) {
      setState({
        user: result.data,
        token: null,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      setState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  };

  const login = async (credentials: LoginCredentials) => {
    const result = await api.login(credentials);
    if (result.success && result.data) {
      const token = result.data.token ?? null;
      if (token) api.setToken(token);
      setState({
        user: result.data.user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const register = async (data: RegisterData) => {
    const result = await api.register(data);
    if (result.success && result.data) {
      const token = result.data.token ?? null;
      if (token) api.setToken(token);
      setState({
        user: result.data.user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const logout = useCallback(async () => {
    await api.logout();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  useIdleTimeout(logout, state.isAuthenticated);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
