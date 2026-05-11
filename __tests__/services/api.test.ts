/**
 * API Service Tests
 * Tests for sendChatMessage, transcribeAudio, sendTelemetry, checkGatewayHealth,
 * and getGatewayMetrics — all using mocked axios.
 */

// Mock telemetryService so we don't need the full module
jest.mock('../../src/services/telemetry', () => ({
  telemetryService: {
    trackChatError: jest.fn(),
    trackSTTFailure: jest.fn(),
    trackNetworkError: jest.fn(),
  },
}));

// Mock expo-constants via its mock — the jest.config.js mapper handles the path,
// but we reference it here to make expectations about the gateway URL clear.
// GATEWAY_URL will be 'http://localhost:3000' based on expo-constants-mock.ts

import axios from 'axios';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

import {
  sendChatMessage,
  transcribeAudio,
  sendTelemetry,
  checkGatewayHealth,
  getGatewayMetrics,
} from '../../src/services/api';

import { telemetryService } from '../../src/services/telemetry';

const mockTelemetry = telemetryService as jest.Mocked<typeof telemetryService>;

const GATEWAY = 'http://localhost:3000';

function axiosSuccess<T>(data: T) {
  return Promise.resolve({ data, status: 200 });
}

function axiosError(status: number, data?: any, code?: string) {
  const err: any = new Error(`Request failed with status code ${status}`);
  err.response = { status, data };
  if (code) err.code = code;
  err.isAxiosError = true;
  // Return the raw Error — pass to mockRejectedValueOnce, not Promise.reject
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── sendChatMessage ─────────────────────────────────────────────────────────

describe('sendChatMessage', () => {
  it('posts to /api/chat and returns the message string', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ message: 'Hello from AI' }));

    const messages = [{ role: 'user' as const, content: 'Hi' }];
    const result = await sendChatMessage(messages);

    expect(result).toBe('Hello from AI');
    expect(mockAxios.post).toHaveBeenCalledWith(
      `${GATEWAY}/api/chat`,
      expect.objectContaining({ messages: [{ role: 'user', content: 'Hi' }] }),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })
    );
  });

  it('strips system-role messages before sending', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ message: 'ok' }));

    const messages = [
      { role: 'system' as const, content: 'system context' },
      { role: 'user' as const, content: 'question' },
    ];
    await sendChatMessage(messages);

    const body = mockAxios.post.mock.calls[0][1] as any;
    const sentMessages = body.messages;
    expect(sentMessages.some((m: any) => m.role === 'system')).toBe(false);
    expect(sentMessages).toEqual([{ role: 'user', content: 'question' }]);
  });

  it('forwards memoryContext in the request body when provided', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ message: 'ok' }));

    await sendChatMessage([{ role: 'user' as const, content: 'hi' }], 'memory context here');

    const body = mockAxios.post.mock.calls[0][1] as any;
    expect(body.memoryContext).toBe('memory context here');
  });

  it('sets X-Client-Version header', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ message: 'ok' }));
    await sendChatMessage([{ role: 'user' as const, content: 'hi' }]);

    const config = mockAxios.post.mock.calls[0][2] as any;
    expect(config.headers['X-Client-Version']).toBe('1.0.0');
  });

  it('sets a 30s timeout', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ message: 'ok' }));
    await sendChatMessage([{ role: 'user' as const, content: 'hi' }]);

    const config = mockAxios.post.mock.calls[0][2] as any;
    expect(config.timeout).toBe(30000);
  });

  it('throws user-friendly message on 429 Too Many Requests', async () => {
    mockAxios.post.mockRejectedValueOnce(axiosError(429));

    await expect(sendChatMessage([{ role: 'user' as const, content: 'hi' }])).rejects.toThrow(
      'Too many requests. Please wait a moment and try again.'
    );
  });

  it('throws user-friendly message on 504 Gateway Timeout', async () => {
    mockAxios.post.mockRejectedValueOnce(axiosError(504));

    await expect(sendChatMessage([{ role: 'user' as const, content: 'hi' }])).rejects.toThrow(
      'Request timed out. Please try again.'
    );
  });

  it('throws the server error message when response has error field', async () => {
    mockAxios.post.mockRejectedValueOnce(axiosError(400, { error: 'Invalid request payload' }));

    await expect(sendChatMessage([{ role: 'user' as const, content: 'hi' }])).rejects.toThrow(
      'Invalid request payload'
    );
  });

  it('throws connection error when ECONNREFUSED', async () => {
    const err: any = new Error('connect ECONNREFUSED');
    err.code = 'ECONNREFUSED';
    err.isAxiosError = true;
    mockAxios.post.mockRejectedValueOnce(err);

    await expect(sendChatMessage([{ role: 'user' as const, content: 'hi' }])).rejects.toThrow(
      'Unable to connect to the service. Please check your internet connection.'
    );
    expect(mockTelemetry.trackNetworkError).toHaveBeenCalledWith('gateway_unavailable');
  });

  it('throws generic error on unknown failures', async () => {
    const err: any = new Error('unknown');
    err.isAxiosError = true;
    mockAxios.post.mockRejectedValueOnce(err);

    await expect(sendChatMessage([{ role: 'user' as const, content: 'hi' }])).rejects.toThrow(
      'Something went wrong. Please try again.'
    );
  });

  it('calls telemetry.trackChatError on failure', async () => {
    mockAxios.post.mockRejectedValueOnce(axiosError(500));

    try { await sendChatMessage([{ role: 'user' as const, content: 'hi' }]); } catch {}

    expect(mockTelemetry.trackChatError).toHaveBeenCalled();
  });
});

// ─── transcribeAudio ─────────────────────────────────────────────────────────

describe('transcribeAudio', () => {
  const fakeBlob = new Blob(['audio'], { type: 'audio/webm' });

  it('posts to /api/stt and returns transcription text', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ text: 'Hello world' }));

    const result = await transcribeAudio(fakeBlob, 'en');

    expect(result).toBe('Hello world');
    expect(mockAxios.post).toHaveBeenCalledWith(
      `${GATEWAY}/api/stt`,
      expect.any(FormData),
      expect.objectContaining({ headers: expect.objectContaining({ 'Content-Type': 'multipart/form-data' }) })
    );
  });

  it('defaults language to "en"', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ text: 'test' }));
    await transcribeAudio(fakeBlob);

    // Verify FormData was sent (language appended internally)
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
  });

  it('sets a 60s timeout', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({ text: 'test' }));
    await transcribeAudio(fakeBlob, 'hi');

    const config = mockAxios.post.mock.calls[0][2] as any;
    expect(config.timeout).toBe(60000);
  });

  it('throws user-friendly message on 429', async () => {
    mockAxios.post.mockRejectedValueOnce(axiosError(429));

    await expect(transcribeAudio(fakeBlob)).rejects.toThrow(
      'Voice processing is busy. Please wait and try again.'
    );
  });

  it('throws server error message when response contains error field', async () => {
    mockAxios.post.mockRejectedValueOnce(axiosError(400, { error: 'Unsupported audio format' }));

    await expect(transcribeAudio(fakeBlob)).rejects.toThrow('Unsupported audio format');
  });

  it('throws generic audio error on unknown failures', async () => {
    const err: any = new Error('network down');
    err.isAxiosError = true;
    mockAxios.post.mockRejectedValueOnce(err);

    await expect(transcribeAudio(fakeBlob)).rejects.toThrow(
      'Could not understand the audio. Please try speaking again.'
    );
  });

  it('calls telemetry.trackSTTFailure on failure', async () => {
    mockAxios.post.mockRejectedValueOnce(axiosError(503));

    try { await transcribeAudio(fakeBlob); } catch {}

    expect(mockTelemetry.trackSTTFailure).toHaveBeenCalled();
  });
});

// ─── sendTelemetry ───────────────────────────────────────────────────────────

describe('sendTelemetry', () => {
  it('posts event and data to /api/telemetry', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({}));

    await sendTelemetry('chat_error', { userId: '123' });

    expect(mockAxios.post).toHaveBeenCalledWith(
      `${GATEWAY}/api/telemetry`,
      { event: 'chat_error', data: { userId: '123' } },
      expect.any(Object)
    );
  });

  it('resolves without throwing when server fails', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('network error'));

    await expect(sendTelemetry('stt_failure', {})).resolves.toBeUndefined();
  });

  it('sets a 5s timeout', async () => {
    mockAxios.post.mockResolvedValueOnce(axiosSuccess({}));
    await sendTelemetry('event', {});

    const config = mockAxios.post.mock.calls[0][2] as any;
    expect(config.timeout).toBe(5000);
  });
});

// ─── checkGatewayHealth ──────────────────────────────────────────────────────

describe('checkGatewayHealth', () => {
  it('returns true when server responds with status healthy', async () => {
    mockAxios.get.mockResolvedValueOnce(axiosSuccess({ status: 'healthy' }));

    const result = await checkGatewayHealth();

    expect(result).toBe(true);
    expect(mockAxios.get).toHaveBeenCalledWith(`${GATEWAY}/health`, expect.any(Object));
  });

  it('returns false when server responds with non-healthy status', async () => {
    mockAxios.get.mockResolvedValueOnce(axiosSuccess({ status: 'degraded' }));

    const result = await checkGatewayHealth();
    expect(result).toBe(false);
  });

  it('returns false when server request fails', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('timeout'));

    const result = await checkGatewayHealth();
    expect(result).toBe(false);
  });

  it('sets a 5s timeout', async () => {
    mockAxios.get.mockResolvedValueOnce(axiosSuccess({ status: 'healthy' }));
    await checkGatewayHealth();

    const config = mockAxios.get.mock.calls[0][1] as any;
    expect(config.timeout).toBe(5000);
  });
});

// ─── getGatewayMetrics ───────────────────────────────────────────────────────

describe('getGatewayMetrics', () => {
  it('returns metrics data from server', async () => {
    const metrics = { requests: 100, errors: 2 };
    mockAxios.get.mockResolvedValueOnce(axiosSuccess(metrics));

    const result = await getGatewayMetrics();
    expect(result).toEqual(metrics);
  });

  it('returns null when request fails', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('server error'));

    const result = await getGatewayMetrics();
    expect(result).toBeNull();
  });

  it('calls /metrics endpoint', async () => {
    mockAxios.get.mockResolvedValueOnce(axiosSuccess({}));
    await getGatewayMetrics();

    expect(mockAxios.get).toHaveBeenCalledWith(`${GATEWAY}/metrics`, expect.any(Object));
  });
});
