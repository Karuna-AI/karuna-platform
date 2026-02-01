import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';
import { OpenAIMessage } from '../types';
import { telemetryService } from './telemetry';

/**
 * API Configuration
 *
 * In production, set GATEWAY_URL to your server URL
 * For local development, it uses the local gateway or falls back to direct OpenAI
 */
const GATEWAY_URL = Constants.expoConfig?.extra?.apiUrl || 'https://karuna-api-production.up.railway.app';

interface ChatResponse {
  message: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface STTResponse {
  text: string;
}

/**
 * Send a chat message through the gateway
 */
export async function sendChatMessage(
  messages: OpenAIMessage[],
  memoryContext?: string
): Promise<string> {
  return sendChatViaGateway(messages, memoryContext);
}

/**
 * Chat via secure gateway (production)
 */
async function sendChatViaGateway(
  messages: OpenAIMessage[],
  memoryContext?: string
): Promise<string> {
  try {
    const response = await axios.post<ChatResponse>(
      `${GATEWAY_URL}/api/chat`,
      {
        messages: messages.filter(m => m.role !== 'system'),
        memoryContext,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Version': '1.0.0',
        },
        timeout: 30000,
      }
    );

    return response.data.message;
  } catch (error) {
    const axiosError = error as AxiosError<{ error: string }>;

    // Track the error
    telemetryService.trackChatError(
      axiosError.message,
      axiosError.response?.status
    );

    if (axiosError.response?.status === 429) {
      throw new Error('Too many requests. Please wait a moment and try again.');
    }

    if (axiosError.response?.status === 504) {
      throw new Error('Request timed out. Please try again.');
    }

    if (axiosError.response?.data?.error) {
      throw new Error(axiosError.response.data.error);
    }

    if (axiosError.code === 'ECONNREFUSED') {
      telemetryService.trackNetworkError('gateway_unavailable');
      throw new Error('Unable to connect to the service. Please check your internet connection.');
    }

    throw new Error('Something went wrong. Please try again.');
  }
}

/**
 * Transcribe audio via gateway
 */
export async function transcribeAudio(audioBlob: Blob, language = 'en'): Promise<string> {
  return transcribeViaGateway(audioBlob, language);
}

/**
 * STT via secure gateway (production)
 */
async function transcribeViaGateway(audioBlob: Blob, language: string): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');
    formData.append('language', language);

    const response = await axios.post<STTResponse>(
      `${GATEWAY_URL}/api/stt`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-Client-Version': '1.0.0',
        },
        timeout: 60000,
      }
    );

    return response.data.text;
  } catch (error) {
    const axiosError = error as AxiosError<{ error: string }>;

    telemetryService.trackSTTFailure(
      axiosError.message,
      axiosError.response?.status?.toString()
    );

    if (axiosError.response?.status === 429) {
      throw new Error('Voice processing is busy. Please wait and try again.');
    }

    if (axiosError.response?.data?.error) {
      throw new Error(axiosError.response.data.error);
    }

    throw new Error('Could not understand the audio. Please try speaking again.');
  }
}

/**
 * Send telemetry event to gateway
 */
export async function sendTelemetry(event: string, data: Record<string, any>): Promise<void> {

  try {
    await axios.post(
      `${GATEWAY_URL}/api/telemetry`,
      { event, data },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      }
    );
  } catch (error) {
    // Silently fail - telemetry should never break the app
    console.warn('Telemetry send failed:', error);
  }
}

/**
 * Check gateway health
 */
export async function checkGatewayHealth(): Promise<boolean> {
  
  try {
    const response = await axios.get(`${GATEWAY_URL}/health`, { timeout: 5000 });
    return response.data.status === 'healthy';
  } catch {
    return false;
  }
}

/**
 * Get gateway metrics (for debugging)
 */
export async function getGatewayMetrics(): Promise<any> {
  
  try {
    const response = await axios.get(`${GATEWAY_URL}/metrics`, { timeout: 5000 });
    return response.data;
  } catch {
    return null;
  }
}
