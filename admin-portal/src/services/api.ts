import axios, { AxiosInstance, AxiosError } from 'axios';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class AdminApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${import.meta.env.VITE_API_URL || ''}/api/admin`,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      withCredentials: true,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          window.dispatchEvent(new CustomEvent('karuna:auth:unauthorized'));
        }
        return Promise.reject(error);
      }
    );
  }

  async logout(): Promise<void> {
    await this.client.post('/auth/logout');
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

  async acknowledgeAlert(alertId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post(`/health-alerts/${alertId}/acknowledge`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to acknowledge alert' };
    }
  }

  async resolveAlert(alertId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post(`/health-alerts/${alertId}/resolve`);
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to resolve alert' };
    }
  }

  // Users
  async getUsers(params: { page?: number; limit?: number; search?: string; status?: string; sortBy?: string; sortDir?: string } = {}): Promise<ApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.search) queryParams.append('search', params.search);
      if (params.status) queryParams.append('status', params.status);
      if (params.sortBy) queryParams.append('sortBy', params.sortBy);
      if (params.sortDir) queryParams.append('sortDir', params.sortDir);
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

  async createUser(data: { name: string; email: string; phone?: string }): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post('/users', data);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Failed to create user' };
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

  async updateCircle(circleId: string, data: { name?: string; care_recipient_name?: string }): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.put(`/circles/${circleId}`, data);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Failed to update circle' };
    }
  }

  async deactivateCircle(circleId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post(`/circles/${circleId}/deactivate`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Failed to deactivate circle' };
    }
  }

  async activateCircle(circleId: string): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.post(`/circles/${circleId}/activate`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Failed to activate circle' };
    }
  }

  async removeCircleMember(circleId: string, memberId: string): Promise<ApiResponse<void>> {
    try {
      await this.client.delete(`/circles/${circleId}/members/${memberId}`);
      return { success: true };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Failed to remove member' };
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

  async updateFeatureFlagRollout(flagId: string, rolloutPercentage: number): Promise<ApiResponse<any>> {
    try {
      const response = await this.client.patch(`/feature-flags/${flagId}`, { rollout_percentage: rolloutPercentage });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: 'Failed to update rollout percentage' };
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

  async deleteFeatureFlag(flagId: string): Promise<ApiResponse<void>> {
    try {
      await this.client.delete(`/feature-flags/${flagId}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to delete feature flag' };
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

  async getAdminAuditLogs(params: { page?: number; limit?: number; action?: string } = {}): Promise<ApiResponse<any>> {
    try {
      const queryParams = new URLSearchParams();
      if (params.page) queryParams.append('page', params.page.toString());
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.action) queryParams.append('action', params.action);
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

// Direct axios client for dashboard pages — uses httpOnly cookie automatically
// Shares the same 401→logout behaviour as AdminApiService
const _adminAxios = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ''}/api/admin`,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
  withCredentials: true,
});
_adminAxios.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('karuna:auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const adminAPI = {
  get: (url: string) => _adminAxios.get(url),
  post: (url: string, data?: any) => _adminAxios.post(url, data),
};

export default api;
