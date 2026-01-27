import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { AuthState, LoginCredentials, RegisterData } from '../types';
import api from '../services/api';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
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
    // Check for existing token and validate
    const token = api.getToken();
    if (token) {
      validateToken();
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const validateToken = async () => {
    const result = await api.getProfile();
    if (result.success && result.data) {
      setState({
        user: result.data,
        token: api.getToken(),
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      api.clearToken();
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
      api.setToken(result.data.token);
      setState({
        user: result.data.user,
        token: result.data.token,
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
      api.setToken(result.data.token);
      setState({
        user: result.data.user,
        token: result.data.token,
        isAuthenticated: true,
        isLoading: false,
      });
      return { success: true };
    }
    return { success: false, error: result.error };
  };

  const logout = () => {
    api.clearToken();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

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
