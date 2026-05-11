import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  ApiResponse,
  User,
  CareCircle,
  CareCircleMember,
  CareCircleInvitation,
  SyncData,
  LoginCredentials,
  RegisterData,
  CareCircleRole,
  VaultNote,
  HealthDataResponse,
  AdherenceResponse,
  ActivityResponse,
  AlertsResponse,
  CaregiverAlert,
  CheckinsResponse,
  DashboardData,
} from '../types';

const CSRF_COOKIE_NAME = import.meta.env.VITE_CSRF_COOKIE_NAME || 'csrf-token';

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${import.meta.env.VITE_API_URL || ''}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true,
      timeout: 15000,
    });

    // Add in-memory Bearer token for mobile/API fallback (not used in browser portal)
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }

      // CSRF double-submit: send the csrf-token cookie value as a header on mutating requests
      const method = (config.method || '').toLowerCase();
      if (['post', 'put', 'patch', 'delete'].includes(method)) {
        const csrfToken = document.cookie
          .split('; ')
          .find(row => row.startsWith(`${CSRF_COOKIE_NAME}=`))
          ?.split('=')[1];
        if (csrfToken) {
          config.headers['X-CSRF-Token'] = decodeURIComponent(csrfToken);
        }
      }

      return config;
    });

    // Handle auth and timeout errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.code === 'ECONNABORTED') {
          return Promise.reject(new Error('Request timed out. Please check your connection.'));
        }
        if (error.response?.status === 401) {
          this.clearToken();
          window.dispatchEvent(new CustomEvent('karuna:auth:unauthorized'));
        }
        return Promise.reject(error);
      }
    );
  }

  setToken(token: string) {
    // Keep in memory only — httpOnly cookie is the primary auth mechanism in browser
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  getToken(): string | null {
    return this.token;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/care/auth/logout');
    } finally {
      this.clearToken();
    }
  }

  // Auth endpoints
  async register(data: RegisterData): Promise<ApiResponse<{ user: User; token: string }>> {
    try {
      const response = await this.client.post('/care/auth/register', data);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Registration failed',
      };
    }
  }

  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: User; token: string }>> {
    try {
      const response = await this.client.post('/care/auth/login', credentials);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Login failed',
      };
    }
  }

  async forgotPassword(email: string): Promise<ApiResponse<{ message: string; resetToken?: string; resetUrl?: string }>> {
    try {
      const response = await this.client.post('/care/auth/forgot-password', { email });
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Failed to send reset email' };
    }
  }

  async resetPassword(token: string, password: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.client.post('/care/auth/reset-password', { token, password });
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return { success: false, error: axiosError.response?.data?.error || 'Failed to reset password' };
    }
  }

  async getProfile(): Promise<ApiResponse<User>> {
    try {
      const response = await this.client.get('/care/auth/me');
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get profile',
      };
    }
  }

  // Care Circle endpoints
  async createCareCircle(data: {
    name: string;
    elderlyName: string;
  }): Promise<ApiResponse<CareCircle>> {
    try {
      const response = await this.client.post('/care/circles', data);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to create care circle',
      };
    }
  }

  async getCareCircles(): Promise<ApiResponse<CareCircle[]>> {
    try {
      const response = await this.client.get('/care/circles');
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get care circles',
      };
    }
  }

  async getCareCircle(id: string): Promise<ApiResponse<CareCircle & { members: CareCircleMember[] }>> {
    try {
      const response = await this.client.get(`/care/circles/${id}`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get care circle',
      };
    }
  }

  async updateCareCircle(
    id: string,
    data: Partial<CareCircle>
  ): Promise<ApiResponse<CareCircle>> {
    try {
      const response = await this.client.put(`/care/circles/${id}`, data);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to update care circle',
      };
    }
  }

  async deleteCareCircle(id: string): Promise<ApiResponse<void>> {
    try {
      await this.client.delete(`/care/circles/${id}`);
      return { success: true };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to delete care circle',
      };
    }
  }

  // Invitation endpoints
  async inviteMember(
    circleId: string,
    data: { email: string; role: CareCircleRole }
  ): Promise<ApiResponse<CareCircleInvitation>> {
    try {
      const response = await this.client.post(`/care/circles/${circleId}/invite`, data);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to send invitation',
      };
    }
  }

  async acceptInvitation(token: string): Promise<ApiResponse<CareCircle>> {
    try {
      const response = await this.client.post(`/care/invitations/${token}/accept`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to accept invitation',
      };
    }
  }

  async removeMember(circleId: string, memberId: string): Promise<ApiResponse<void>> {
    try {
      await this.client.delete(`/care/circles/${circleId}/members/${memberId}`);
      return { success: true };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to remove member',
      };
    }
  }

  async updateMemberRole(
    circleId: string,
    memberId: string,
    role: CareCircleRole
  ): Promise<ApiResponse<CareCircleMember>> {
    try {
      const response = await this.client.put(
        `/care/circles/${circleId}/members/${memberId}`,
        { role }
      );
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to update member role',
      };
    }
  }

  // Sync endpoints
  async getSyncData(circleId: string): Promise<ApiResponse<SyncData>> {
    try {
      const response = await this.client.get(`/care/circles/${circleId}/sync`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to sync data',
      };
    }
  }

  async pushSyncChanges(
    circleId: string,
    changes: Record<string, unknown>[]
  ): Promise<ApiResponse<{ conflicts: Record<string, unknown>[] }>> {
    try {
      const response = await this.client.post(`/care/circles/${circleId}/sync`, {
        changes,
      });
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to push changes',
      };
    }
  }

  // Notes endpoints
  async addNote(
    circleId: string,
    note: Omit<VaultNote, 'id' | 'authorId' | 'authorName' | 'createdAt' | 'updatedAt'>
  ): Promise<ApiResponse<VaultNote>> {
    try {
      const response = await this.client.post(`/care/circles/${circleId}/notes`, note);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to add note',
      };
    }
  }

  async updateNote(
    circleId: string,
    noteId: string,
    data: Partial<VaultNote>
  ): Promise<ApiResponse<VaultNote>> {
    try {
      const response = await this.client.put(
        `/care/circles/${circleId}/notes/${noteId}`,
        data
      );
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to update note',
      };
    }
  }

  async deleteNote(circleId: string, noteId: string): Promise<ApiResponse<void>> {
    try {
      await this.client.delete(`/care/circles/${circleId}/notes/${noteId}`);
      return { success: true };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to delete note',
      };
    }
  }

  // Dashboard endpoint (comprehensive summary)
  async getDashboard(circleId: string): Promise<ApiResponse<DashboardData>> {
    try {
      const response = await this.client.get(`/care/circles/${circleId}/dashboard`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get dashboard data',
      };
    }
  }

  // Health data endpoints
  async getHealthData(circleId: string, days = 7, type?: string): Promise<ApiResponse<HealthDataResponse>> {
    try {
      const params = new URLSearchParams({ days: days.toString() });
      if (type) params.append('type', type);
      const response = await this.client.get(`/care/circles/${circleId}/health?${params}`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get health data',
      };
    }
  }

  // Medication adherence endpoints
  async getAdherence(circleId: string, days = 7): Promise<ApiResponse<AdherenceResponse>> {
    try {
      const response = await this.client.get(`/care/circles/${circleId}/adherence?days=${days}`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get adherence data',
      };
    }
  }

  // Activity monitoring endpoints
  async getActivity(circleId: string, days = 7): Promise<ApiResponse<ActivityResponse>> {
    try {
      const response = await this.client.get(`/care/circles/${circleId}/activity?days=${days}`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get activity data',
      };
    }
  }

  // Alerts endpoints
  async getAlerts(circleId: string, status = 'active'): Promise<ApiResponse<AlertsResponse>> {
    try {
      const response = await this.client.get(`/care/circles/${circleId}/alerts?status=${status}`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get alerts',
      };
    }
  }

  async acknowledgeAlert(circleId: string, alertId: string): Promise<ApiResponse<CaregiverAlert>> {
    try {
      const response = await this.client.post(`/care/circles/${circleId}/alerts/${alertId}/acknowledge`);
      return { success: true, data: response.data.alert };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to acknowledge alert',
      };
    }
  }

  async dismissAlert(circleId: string, alertId: string): Promise<ApiResponse<CaregiverAlert>> {
    try {
      const response = await this.client.post(`/care/circles/${circleId}/alerts/${alertId}/dismiss`);
      return { success: true, data: response.data.alert };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to dismiss alert',
      };
    }
  }

  // Check-in endpoints
  async getCheckins(circleId: string, days = 7): Promise<ApiResponse<CheckinsResponse>> {
    try {
      const response = await this.client.get(`/care/circles/${circleId}/checkins?days=${days}`);
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError<{ error: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.error || 'Failed to get check-in data',
      };
    }
  }
}

export const api = new ApiService();
export default api;
