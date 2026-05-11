/**
 * Memory Service Tests
 * Tests for summary threshold logic, conversation processing, memory extraction,
 * quick-extract patterns, and prompt formatting.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('../../src/web/async-storage-mock')
);

// Mock storageService so we control all storage interactions
jest.mock('../../src/services/storage', () => ({
  storageService: {
    loadMemory: jest.fn(),
    saveMemory: jest.fn(),
    updateMemory: jest.fn(),
    getLastSummaryIndex: jest.fn(),
    setLastSummaryIndex: jest.fn(),
    addKeyPerson: jest.fn(),
    addCustomInstruction: jest.fn(),
  },
}));

// Mock openAIService
jest.mock('../../src/services/openai', () => ({
  openAIService: {
    chat: jest.fn(),
  },
}));

import { memoryService } from '../../src/services/memory';
import { storageService } from '../../src/services/storage';
import { openAIService } from '../../src/services/openai';
import type { UserMemory } from '../../src/services/storage';
import type { Message } from '../../src/types';

const mockStorageService = storageService as jest.Mocked<typeof storageService>;
const mockOpenAI = openAIService as jest.Mocked<typeof openAIService>;

function makeMessage(role: 'user' | 'assistant', content: string, id = Math.random().toString()): Message {
  return { id, role, content, timestamp: Date.now() };
}

function makeDefaultMemory(overrides: Partial<UserMemory> = {}): UserMemory {
  return {
    preferredName: undefined,
    keyPeople: [],
    remindersCreated: [],
    preferences: {},
    customInstructions: [],
    lastUpdated: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  // Reset the isProcessing flag by allowing the promise chain to finish
  jest.clearAllMocks();

  mockStorageService.loadMemory.mockResolvedValue(makeDefaultMemory());
  mockStorageService.saveMemory.mockResolvedValue(undefined);
  mockStorageService.updateMemory.mockResolvedValue(makeDefaultMemory());
  mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
  mockStorageService.setLastSummaryIndex.mockResolvedValue(undefined);
  mockStorageService.addKeyPerson.mockResolvedValue(undefined);
  mockStorageService.addCustomInstruction.mockResolvedValue(undefined);

  mockOpenAI.chat.mockResolvedValue(JSON.stringify({
    preferredName: null,
    newPeople: [],
    preferences: {},
    customInstructions: [],
  }));
});

// ─── shouldGenerateSummary ───────────────────────────────────────────────────

describe('shouldGenerateSummary', () => {
  it('returns true when message count is exactly 6 more than lastSummaryIndex', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const result = await memoryService.shouldGenerateSummary(6);
    expect(result).toBe(true);
  });

  it('returns true when message count exceeds threshold', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(2);
    const result = await memoryService.shouldGenerateSummary(10);
    expect(result).toBe(true);
  });

  it('returns false when fewer than 6 messages since last summary', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const result = await memoryService.shouldGenerateSummary(5);
    expect(result).toBe(false);
  });

  it('returns false when count equals lastSummaryIndex (no new messages)', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(6);
    const result = await memoryService.shouldGenerateSummary(6);
    expect(result).toBe(false);
  });

  it('delegates to storageService.getLastSummaryIndex', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(3);
    await memoryService.shouldGenerateSummary(9);
    expect(mockStorageService.getLastSummaryIndex).toHaveBeenCalledTimes(1);
  });
});

// ─── processConversation – guard conditions ──────────────────────────────────

describe('processConversation – skips when conditions not met', () => {
  it('skips when messages array has only 1 message', async () => {
    const messages = [makeMessage('user', 'hello')];
    await memoryService.processConversation(messages);
    expect(mockStorageService.getLastSummaryIndex).not.toHaveBeenCalled();
  });

  it('skips when messages array is empty', async () => {
    await memoryService.processConversation([]);
    expect(mockStorageService.getLastSummaryIndex).not.toHaveBeenCalled();
  });

  it('does not call OpenAI when shouldGenerateSummary is false', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const messages = Array.from({ length: 4 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
    );

    await memoryService.processConversation(messages);
    expect(mockOpenAI.chat).not.toHaveBeenCalled();
  });

  it('blocks concurrent calls via isProcessing flag', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
    );

    // Start first call (does not await yet)
    const first = memoryService.processConversation(messages);
    // Immediately start second call
    const second = memoryService.processConversation(messages);

    await Promise.all([first, second]);

    // OpenAI should only be called once (first call; second is blocked)
    expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
  });
});

describe('processConversation – triggers extraction', () => {
  it('calls openAIService.chat when threshold is reached', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `message ${i}`)
    );

    await memoryService.processConversation(messages);

    expect(mockOpenAI.chat).toHaveBeenCalledTimes(1);
  });

  it('advances the summary index after extraction', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
    );

    await memoryService.processConversation(messages);

    expect(mockStorageService.setLastSummaryIndex).toHaveBeenCalledWith(6);
  });

  it('only processes messages since last summary index', async () => {
    mockStorageService.getLastSummaryIndex.mockResolvedValue(2);
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
    );

    await memoryService.processConversation(messages);

    // The prompt sent to OpenAI should reference messages from index 2 onwards
    const callArg = mockOpenAI.chat.mock.calls[0][0];
    const userPrompt = callArg.find((m: any) => m.role === 'user')?.content ?? '';
    expect(userPrompt).toContain('msg 2');
    expect(userPrompt).not.toContain('msg 0');
  });
});

// ─── extractMemory – applying OpenAI response ────────────────────────────────

describe('extractMemory – applies OpenAI response to storage', () => {
  async function runExtraction(aiResponse: string) {
    mockOpenAI.chat.mockResolvedValueOnce(aiResponse);
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
    );
    await memoryService.processConversation(messages);
  }

  it('updates preferredName when AI returns a new name', async () => {
    await runExtraction(JSON.stringify({ preferredName: 'Raj', newPeople: [], preferences: {}, customInstructions: [] }));
    expect(mockStorageService.updateMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferredName: 'Raj' })
    );
  });

  it('does not update preferredName if AI returns null', async () => {
    await runExtraction(JSON.stringify({ preferredName: null, newPeople: [], preferences: {}, customInstructions: [] }));
    expect(mockStorageService.updateMemory).not.toHaveBeenCalledWith(
      expect.objectContaining({ preferredName: null })
    );
  });

  it('adds new people via addKeyPerson', async () => {
    await runExtraction(JSON.stringify({
      preferredName: null,
      newPeople: [{ name: 'Priya', relationship: 'daughter' }],
      preferences: {},
      customInstructions: [],
    }));
    expect(mockStorageService.addKeyPerson).toHaveBeenCalledWith({ name: 'Priya', relationship: 'daughter' });
  });

  it('skips people entries missing name or relationship', async () => {
    await runExtraction(JSON.stringify({
      preferredName: null,
      newPeople: [{ name: '', relationship: 'son' }, { name: 'Ravi', relationship: '' }],
      preferences: {},
      customInstructions: [],
    }));
    expect(mockStorageService.addKeyPerson).not.toHaveBeenCalled();
  });

  it('updates speechRate preference', async () => {
    await runExtraction(JSON.stringify({
      preferredName: null,
      newPeople: [],
      preferences: { speechRate: 'slower' },
      customInstructions: [],
    }));
    expect(mockStorageService.updateMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.objectContaining({ speechRate: 'slower' }) })
    );
  });

  it('adds custom instructions via addCustomInstruction', async () => {
    await runExtraction(JSON.stringify({
      preferredName: null,
      newPeople: [],
      preferences: {},
      customInstructions: ['always speak Hindi', 'remind me about medications'],
    }));
    expect(mockStorageService.addCustomInstruction).toHaveBeenCalledWith('always speak Hindi');
    expect(mockStorageService.addCustomInstruction).toHaveBeenCalledWith('remind me about medications');
  });

  it('handles malformed JSON from OpenAI gracefully without throwing', async () => {
    await expect(runExtraction('not valid json at all')).resolves.toBeUndefined();
    expect(mockStorageService.updateMemory).not.toHaveBeenCalled();
  });

  it('handles OpenAI error gracefully without throwing', async () => {
    mockOpenAI.chat.mockRejectedValueOnce(new Error('OpenAI unavailable'));
    mockStorageService.getLastSummaryIndex.mockResolvedValue(0);
    const messages = Array.from({ length: 6 }, (_, i) =>
      makeMessage(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`)
    );
    await expect(memoryService.processConversation(messages)).resolves.toBeUndefined();
  });
});

// ─── quickExtract ────────────────────────────────────────────────────────────

describe('quickExtract – speech rate', () => {
  it('sets speechRate to slower when user says "speak slower"', async () => {
    const memory = makeDefaultMemory();
    mockStorageService.loadMemory.mockResolvedValue(memory);
    await memoryService.quickExtract('Please speak slower for me');
    expect(mockStorageService.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.objectContaining({ speechRate: 'slower' }) })
    );
  });

  it('sets speechRate to slower when user says "talk slower"', async () => {
    const memory = makeDefaultMemory();
    mockStorageService.loadMemory.mockResolvedValue(memory);
    await memoryService.quickExtract('Can you talk slower?');
    expect(mockStorageService.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.objectContaining({ speechRate: 'slower' }) })
    );
  });

  it('sets speechRate to faster when user says "speak faster"', async () => {
    const memory = makeDefaultMemory();
    mockStorageService.loadMemory.mockResolvedValue(memory);
    await memoryService.quickExtract('speak faster please');
    expect(mockStorageService.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.objectContaining({ speechRate: 'faster' }) })
    );
  });

  it('sets speechRate to faster when user says "speed up"', async () => {
    const memory = makeDefaultMemory();
    mockStorageService.loadMemory.mockResolvedValue(memory);
    await memoryService.quickExtract('can you speed up a bit');
    expect(mockStorageService.saveMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferences: expect.objectContaining({ speechRate: 'faster' }) })
    );
  });
});

describe('quickExtract – name detection', () => {
  it('extracts preferred name from "call me X"', async () => {
    await memoryService.quickExtract('Please call me Sree');
    expect(mockStorageService.updateMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferredName: 'Sree' })
    );
  });

  it('extracts preferred name from "my name is X"', async () => {
    await memoryService.quickExtract('My name is Ananya');
    expect(mockStorageService.updateMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferredName: 'Ananya' })
    );
  });

  it('capitalises the extracted name', async () => {
    await memoryService.quickExtract('call me ravi');
    expect(mockStorageService.updateMemory).toHaveBeenCalledWith(
      expect.objectContaining({ preferredName: 'Ravi' })
    );
  });
});

describe('quickExtract – relationship detection', () => {
  it('adds a key person from "my son Arjun"', async () => {
    await memoryService.quickExtract('my son Arjun');
    expect(mockStorageService.addKeyPerson).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Arjun', relationship: 'son' })
    );
  });

  it('adds a key person from "my daughter is Meera"', async () => {
    await memoryService.quickExtract('my daughter is Meera');
    expect(mockStorageService.addKeyPerson).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Meera', relationship: 'daughter' })
    );
  });

  it('does not call addKeyPerson on unrelated messages', async () => {
    await memoryService.quickExtract('What is the weather today?');
    expect(mockStorageService.addKeyPerson).not.toHaveBeenCalled();
    expect(mockStorageService.updateMemory).not.toHaveBeenCalled();
    expect(mockStorageService.saveMemory).not.toHaveBeenCalled();
  });
});

// ─── formatMemoryForPrompt ───────────────────────────────────────────────────

describe('formatMemoryForPrompt', () => {
  it('returns empty string when memory is blank', async () => {
    mockStorageService.loadMemory.mockResolvedValue(makeDefaultMemory());
    const result = await memoryService.formatMemoryForPrompt();
    expect(result).toBe('');
  });

  it('includes preferred name in output', async () => {
    mockStorageService.loadMemory.mockResolvedValue(makeDefaultMemory({ preferredName: 'Raj' }));
    const result = await memoryService.formatMemoryForPrompt();
    expect(result).toContain('Raj');
  });

  it('includes key people in output', async () => {
    mockStorageService.loadMemory.mockResolvedValue(
      makeDefaultMemory({ keyPeople: [{ name: 'Priya', relationship: 'daughter' }] })
    );
    const result = await memoryService.formatMemoryForPrompt();
    expect(result).toContain('Priya');
    expect(result).toContain('daughter');
  });

  it('includes speech rate preference in output', async () => {
    mockStorageService.loadMemory.mockResolvedValue(
      makeDefaultMemory({ preferences: { speechRate: 'slower' } })
    );
    const result = await memoryService.formatMemoryForPrompt();
    expect(result).toContain('slower');
  });

  it('includes custom instructions in output', async () => {
    mockStorageService.loadMemory.mockResolvedValue(
      makeDefaultMemory({ customInstructions: ['always speak Hindi'] })
    );
    const result = await memoryService.formatMemoryForPrompt();
    expect(result).toContain('always speak Hindi');
  });

  it('wraps output in USER MEMORY markers', async () => {
    mockStorageService.loadMemory.mockResolvedValue(makeDefaultMemory({ preferredName: 'Raj' }));
    const result = await memoryService.formatMemoryForPrompt();
    expect(result).toContain('[USER MEMORY]');
    expect(result).toContain('[END USER MEMORY]');
  });
});

// ─── getMemorySummary ────────────────────────────────────────────────────────

describe('getMemorySummary', () => {
  it('returns "No memories stored yet." when memory is empty', async () => {
    mockStorageService.loadMemory.mockResolvedValue(makeDefaultMemory());
    const result = await memoryService.getMemorySummary();
    expect(result).toBe('No memories stored yet.');
  });

  it('includes preferred name in summary', async () => {
    mockStorageService.loadMemory.mockResolvedValue(makeDefaultMemory({ preferredName: 'Raj' }));
    const result = await memoryService.getMemorySummary();
    expect(result).toContain('Raj');
  });

  it('shows key people count', async () => {
    mockStorageService.loadMemory.mockResolvedValue(
      makeDefaultMemory({ keyPeople: [{ name: 'Priya', relationship: 'daughter' }, { name: 'Dev', relationship: 'son' }] })
    );
    const result = await memoryService.getMemorySummary();
    expect(result).toContain('2');
  });

  it('shows custom instructions count when present', async () => {
    mockStorageService.loadMemory.mockResolvedValue(
      makeDefaultMemory({ customInstructions: ['instr 1', 'instr 2'] })
    );
    const result = await memoryService.getMemorySummary();
    expect(result).toContain('2');
  });
});
