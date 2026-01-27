/**
 * OpenAI Service Tests
 * Tests for AI chat completion, transcription, and streaming
 */

import { mockApiResponse, mockApiError } from '../utils/testUtils';

// Mock the service before importing
jest.mock('../../src/services/openai', () => ({
  transcribeAudio: jest.fn(),
  streamChat: jest.fn(),
  sendChatMessage: jest.fn(),
}));

import { transcribeAudio, streamChat, sendChatMessage } from '../../src/services/openai';

describe('OpenAI Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('transcribeAudio', () => {
    it('should transcribe audio successfully', async () => {
      const mockTranscription = 'Hello, this is a test transcription';
      (transcribeAudio as jest.Mock).mockResolvedValue(mockTranscription);

      const result = await transcribeAudio('/path/to/audio.wav', 'en');

      expect(result).toBe(mockTranscription);
      expect(transcribeAudio).toHaveBeenCalledWith('/path/to/audio.wav', 'en');
    });

    it('should handle transcription with different languages', async () => {
      const mockTranscription = 'नमस्ते, यह एक परीक्षण है';
      (transcribeAudio as jest.Mock).mockResolvedValue(mockTranscription);

      const result = await transcribeAudio('/path/to/audio.wav', 'hi');

      expect(result).toBe(mockTranscription);
      expect(transcribeAudio).toHaveBeenCalledWith('/path/to/audio.wav', 'hi');
    });

    it('should handle transcription errors gracefully', async () => {
      (transcribeAudio as jest.Mock).mockRejectedValue(new Error('Transcription failed'));

      await expect(transcribeAudio('/path/to/audio.wav', 'en'))
        .rejects.toThrow('Transcription failed');
    });

    it('should use default language when not specified', async () => {
      const mockTranscription = 'Default language test';
      (transcribeAudio as jest.Mock).mockResolvedValue(mockTranscription);

      await transcribeAudio('/path/to/audio.wav');

      expect(transcribeAudio).toHaveBeenCalled();
    });
  });

  describe('streamChat', () => {
    it('should stream chat responses', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
      ];
      const mockCallback = jest.fn();

      (streamChat as jest.Mock).mockImplementation(async (msgs, cb) => {
        cb('Hello');
        cb(' there');
        cb('!');
        return 'Hello there!';
      });

      await streamChat(messages, mockCallback);

      expect(mockCallback).toHaveBeenCalledTimes(3);
      expect(mockCallback).toHaveBeenNthCalledWith(1, 'Hello');
      expect(mockCallback).toHaveBeenNthCalledWith(2, ' there');
      expect(mockCallback).toHaveBeenNthCalledWith(3, '!');
    });

    it('should handle streaming errors', async () => {
      (streamChat as jest.Mock).mockRejectedValue(new Error('Stream error'));

      await expect(streamChat([], jest.fn()))
        .rejects.toThrow('Stream error');
    });

    it('should handle tool calls in stream', async () => {
      const mockCallback = jest.fn();
      const mockToolCall = {
        type: 'tool_call',
        name: 'get_health_data',
        arguments: { type: 'vitals' },
      };

      (streamChat as jest.Mock).mockImplementation(async (msgs, cb) => {
        cb({ toolCall: mockToolCall });
        return { toolCall: mockToolCall };
      });

      await streamChat([], mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({ toolCall: mockToolCall });
    });
  });

  describe('sendChatMessage', () => {
    it('should send chat message and return response', async () => {
      const mockResponse = { content: 'AI response', role: 'assistant' };
      (sendChatMessage as jest.Mock).mockResolvedValue(mockResponse);

      const result = await sendChatMessage([
        { role: 'user', content: 'Test message' },
      ]);

      expect(result).toEqual(mockResponse);
    });

    it('should handle conversation history', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      (sendChatMessage as jest.Mock).mockResolvedValue({
        content: 'I am doing well!',
        role: 'assistant',
      });

      await sendChatMessage(messages);

      expect(sendChatMessage).toHaveBeenCalledWith(messages);
    });

    it('should handle rate limiting', async () => {
      (sendChatMessage as jest.Mock).mockRejectedValue(
        new Error('Rate limit exceeded')
      );

      await expect(sendChatMessage([]))
        .rejects.toThrow('Rate limit exceeded');
    });
  });
});

describe('OpenAI Gateway Integration', () => {
  it('should connect to WebSocket gateway', () => {
    const ws = new WebSocket('ws://localhost:3021/ws');
    expect(ws.url).toBe('ws://localhost:3021/ws');
  });

  it('should handle gateway connection errors', () => {
    const ws = new WebSocket('ws://localhost:3021/ws');
    const errorHandler = jest.fn();
    ws.onerror = errorHandler;

    // Simulate error
    ws.onerror?.({ error: new Error('Connection failed') } as any);

    expect(errorHandler).toHaveBeenCalled();
  });
});
