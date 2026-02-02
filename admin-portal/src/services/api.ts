import axios, { AxiosInstance, AxiosError } from 'axios';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class AdminApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${import.meta.env.VITE_API_URL || ''}/api/admin`,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.clearToken();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  // Auth
  async login(email: string, password: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post('/auth/login', { email, password });
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Login failed' };
    }
  }

  async getProfile(): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.get('/auth/me');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get profile' };
    }
  }

  // Dashboard
  async getDashboardMetrics(): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.get('/metrics/dashboard');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get metrics' };
    }
  }

  async getDetailedMetrics(days = 30): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.get(`/metrics/detailed?days=${days}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get detailed metrics' };
    }
  }

  // Users
  async getUsers(params: { page?: number; limit?: number; search?: string; status?: string } = {}): Promise<ApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.search) queryParams.append('search', params.search);
      if (params.status) queryParams.append('status', params.status);
      const response = await this.client.get(`/users?${queryParams}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get users' };
    }
  }

  async getUserDetail(userId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.get(`/users/${userId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get user' };
    }
  }

  async suspendUser(userId: string, reason: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post(`/users/${userId}/suspend`, { reason });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to suspend user' };
    }
  }

  async unsuspendUser(userId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post(`/users/${userId}/unsuspend`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to unsuspend user' };
    }
  }

  async resetUserPassword(userId: string, newPassword: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post(`/users/${userId}/reset-password`, { newPassword });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to reset password' };
    }
  }

  // Circles
  async getCircles(params: { page?: number; limit?: number; search?: string } = {}): Promise<ApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.search) queryParams.append('search', params.search);
      const response = await this.client.get(`/circles?${queryParams}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get circles' };
    }
  }

  async getCircleDetail(circleId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.get(`/circles/${circleId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get circle' };
    }
  }

  // Feature Flags
  async getFeatureFlags(): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.get('/feature-flags');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get feature flags' };
    }
  }

  async updateFeatureFlag(flagId: string, data: any): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.put(`/feature-flags/${flagId}`, data);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to update feature flag' };
    }
  }

  async createFeatureFlag(data: { name: string; description?: string; is_enabled?: boolean }): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post('/feature-flags', data);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to create feature flag' };
    }
  }

  // Audit Logs
  async getAuditLogs(params: { page?: number; limit?: number; action?: string } = {}): Promise<ApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.action) queryParams.append('action', params.action);
      const response = await this.client.get(`/audit-logs?${queryParams}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get audit logs' };
    }
  }

  async getAdminAuditLogs(params: { page?: number; limit?: number } = {}): Promise<ApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      const response = await this.client.get(`/admin-audit-logs?${queryParams}`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get admin audit logs' };
    }
  }

  // Settings
  async getSettings(): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.get('/settings');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to get settings' };
    }
  }

  async updateSetting(key: string, value: any): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.put(`/settings/${key}`, { value });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to update setting' };
    }
  }
}

export const api = new AdminApiService();

// Direct axios client access for new dashboard pages
export const adminAPI = {
  get: async (url: string) => {
    const token = localStorage.getItem('admin_token');
    const response = await axios.get(`${import.meta.env.VITE_API_URL || ''}/api/admin${url}`, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return response;
  },
  post: async (url: string, data?: any) => {
    const token = localStorage.getItem('admin_token');
    const response = await axios.post(`${import.meta.env.VITE_API_URL || ''}/api/admin${url}`, data, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return response;
  },
};

export default api;
