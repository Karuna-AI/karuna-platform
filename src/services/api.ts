import axios, { AxiosError } from 'axios';
import Constants from 'expo-constants';
import NetInfo from '@react-native-community/netinfo';
import { OpenAIMessage } from '../types';
import { telemetryService } from './telemetry';
import { careCircleSyncService } from './careCircleSync';
import { getCurrentTranslations } from '../i18n/translations';

// Attach the care Bearer token when the user is in a circle so the gateway can
// attribute AI usage (chat/STT) to them. Optional — chat/STT work anonymously
// too, so standalone users are unaffected.
function authHeader(): Record<string, string> {
  const token = careCircleSyncService.getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * API Configuration
 *
 * In production, set GATEWAY_URL to your server URL
 * For local development, it uses the local gateway or falls back to direct OpenAI
 */
const GATEWAY_URL = Constants.expoConfig?.extra?.apiUrl || 'https://karuna-gateway-production.up.railway.app';

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

interface STTResponse {
  text: string;
}

/** Thrown when a request is attempted with no connectivity (#38). */
export class OfflineError extends Error {
  constructor() {
    super(getCurrentTranslations().errors.noInternet);
    this.name = 'OfflineError';
  }
}

/** Optional staged-progress callback for long gateway calls (#40). */
export type ApiProgressCallback = (message: string) => void;

/**
 * #38: fail immediately while offline instead of waiting out a timeout.
 */
async function ensureOnline(): Promise<void> {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected === false) {
      throw new OfflineError();
    }
  } catch (error) {
    if (error instanceof OfflineError) {
      throw error;
    }
    // If NetInfo itself fails, let the request attempt decide.
  }
}

/**
 * #37: network-layer failure — the request never got a response.
 */
function isNetworkFailure(error: unknown): boolean {
  const axiosError = error as AxiosError;
  return (
    axiosError.code === 'ERR_NETWORK' ||
    axiosError.code === 'ECONNREFUSED' ||
    (!axiosError.response && !!(axiosError as { request?: unknown }).request)
  );
}

function isTimeout(error: unknown): boolean {
  return (error as AxiosError).code === 'ECONNABORTED';
}

/**
 * #40: one automatic retry for transient failures (network blips, timeouts,
 * 5xx), keeping a rigorous 30-second overall limit — each attempt's axios
 * timeout is capped at the remaining budget, so the total can never exceed
 * 30s. Staged "Still working…" progress is reported via onStatus and to
 * module subscribers (the chat UI shows it) when an attempt runs long.
 */
const apiProgressSubscribers = new Set<ApiProgressCallback>();

/** #40: UI subscribes here to show "Still working…" without threading a
 * callback through every caller. Returns an unsubscribe function. */
export function onApiProgress(callback: ApiProgressCallback): () => void {
  apiProgressSubscribers.add(callback);
  return () => {
    apiProgressSubscribers.delete(callback);
  };
}

function reportApiProgress(message: string, onStatus?: ApiProgressCallback): void {
  try {
    onStatus?.(message);
  } catch {
    /* intentionally empty */
  }
  apiProgressSubscribers.forEach((cb) => {
    try {
      cb(message);
    } catch {
      /* intentionally empty */
    }
  });
}

async function withGatewayRetry<T>(
  operation: (attemptTimeoutMs: number) => Promise<T>,
  onStatus?: ApiProgressCallback
): Promise<T> {
  const startedAt = Date.now();
  const OVERALL_LIMIT_MS = 30_000;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    // #40: rigorous overall limit — this attempt may only use what's left.
    const elapsed = Date.now() - startedAt;
    const budgetLeftMs = OVERALL_LIMIT_MS - elapsed;
    if (budgetLeftMs <= 2_000) break; // not enough time for a useful attempt
    const attemptTimeout = Math.min(30_000, budgetLeftMs);

    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (onStatus || apiProgressSubscribers.size > 0) {
        progressTimer = setTimeout(() => {
          reportApiProgress(getCurrentTranslations().errors.stillWorking, onStatus);
        }, 10_000);
      }
      const result = await operation(attemptTimeout);
      if (progressTimer) clearTimeout(progressTimer);
      return result;
    } catch (error) {
      if (progressTimer) clearTimeout(progressTimer);
      lastError = error;
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      // Transient: dropped connections, timeouts, 5xx. A refused connection
      // (server down) fails fast instead of pointlessly retrying.
      const transient =
        axiosError.code === 'ERR_NETWORK' ||
        isTimeout(error) ||
        (status !== undefined && status >= 500);
      const timeForRetry = Date.now() - startedAt < OVERALL_LIMIT_MS - 5_000;
      if (attempt === 0 && transient && timeForRetry) {
        continue; // one automatic retry
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Send a chat message through the gateway
 */
export async function sendChatMessage(
  messages: OpenAIMessage[],
  memoryContext?: string,
  onStatus?: ApiProgressCallback
): Promise<string> {
  try {
    return await sendChatViaGateway(messages, memoryContext, onStatus);
  } catch (error) {
    throw mapChatError(error);
  }
}

/**
 * Chat via secure gateway (production)
 */
async function sendChatViaGateway(
  messages: OpenAIMessage[],
  memoryContext?: string,
  onStatus?: ApiProgressCallback
): Promise<string> {
  // #38: NetInfo pre-check — fail immediately while offline.
  await ensureOnline();

  const response = await withGatewayRetry(
    (attemptTimeout) =>
      axios.post<ChatResponse>(
        `${GATEWAY_URL}/api/chat`,
        {
          messages: messages.filter(m => m.role !== 'system'),
          memoryContext,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Version': '1.0.0',
            ...authHeader(),
          },
          // #40: capped at the remaining overall budget (never more than 30s).
          timeout: attemptTimeout,
        }
      ),
    onStatus
  );

  return response.data.message;
}

function mapChatError(error: unknown): Error {
  if (error instanceof OfflineError) {
    return error;
  }
  const t = getCurrentTranslations();
  const axiosError = error as AxiosError<{ error: string }>;

  // Track the error
  telemetryService.trackChatError(
    axiosError.message,
    axiosError.response?.status
  );

  if (axiosError.response?.status === 429) {
    return new Error(t.errors.tooManyRequests);
  }

  if (axiosError.response?.status === 504 || isTimeout(error)) {
    return new Error(t.errors.requestTimedOut);
  }

  if (axiosError.response?.data?.error) {
    return new Error(axiosError.response.data.error);
  }

  // #37: network-layer failure → plain-language offline message.
  if (isNetworkFailure(error)) {
    telemetryService.trackNetworkError('gateway_unavailable');
    return new Error(t.errors.noInternet);
  }

  return new Error(t.errors.somethingWentWrong);
}

/**
 * Transcribe audio via gateway
 */
export async function transcribeAudio(
  audioBlob: Blob,
  language = 'en',
  onStatus?: ApiProgressCallback
): Promise<string> {
  try {
    return await transcribeViaGateway(audioBlob, language, onStatus);
  } catch (error) {
    throw mapSTTError(error);
  }
}

/**
 * STT via secure gateway (production)
 */
async function transcribeViaGateway(
  audioBlob: Blob,
  language: string,
  onStatus?: ApiProgressCallback
): Promise<string> {
  // #38: NetInfo pre-check — fail immediately while offline.
  await ensureOnline();

  const formData = new FormData();
  formData.append('audio', audioBlob, 'audio.webm');
  formData.append('language', language);

  const response = await withGatewayRetry(
    (attemptTimeout) =>
      axios.post<STTResponse>(
        `${GATEWAY_URL}/api/stt`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'X-Client-Version': '1.0.0',
            ...authHeader(),
          },
          // #40: was 60s — now capped at the remaining overall budget so
          // transcription can never push the total past 30s.
          timeout: attemptTimeout,
        }
      ),
    onStatus
  );

  return response.data.text;
}

function mapSTTError(error: unknown): Error {
  if (error instanceof OfflineError) {
    return error;
  }
  const t = getCurrentTranslations();
  const axiosError = error as AxiosError<{ error: string }>;

  telemetryService.trackSTTFailure(
    axiosError.message,
    axiosError.response?.status?.toString()
  );

  if (axiosError.response?.status === 429) {
    return new Error(t.errors.voiceBusy);
  }

  if (axiosError.response?.data?.error) {
    return new Error(axiosError.response.data.error);
  }

  // #37: network-layer failure → plain-language offline message.
  if (isNetworkFailure(error) || isTimeout(error)) {
    return new Error(t.errors.noInternet);
  }

  return new Error(t.errors.couldNotUnderstand);
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
