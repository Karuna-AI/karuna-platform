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

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Handle auth errors
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

    // Load token from storage
    const savedToken = localStorage.getItem('auth_token');
    if (savedToken) {
      this.token = savedToken;
    }
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  getToken(): string | null {
    return this.token;
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
