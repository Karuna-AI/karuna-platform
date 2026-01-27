import { OpenAIMessage } from '../types';
import {
  sendChatMessage,
  transcribeAudio as transcribeViaGateway,
} from './api';
import { telemetryService } from './telemetry';

/**
 * Base system prompt - now handled server-side via gateway
 * Kept here for reference and for memory context building
 */
const BASE_SYSTEM_PROMPT = `You are Karuna, a kind and patient AI assistant helping elderly users with technology.
- Use simple, clear language
- Avoid technical jargon
- Be patient and repeat information if asked
- Offer step-by-step guidance
- Confirm understanding before proceeding
- If you don't understand, ask for clarification politely
- Keep responses concise but helpful
- Use a warm, friendly tone
- If the user seems confused, offer to explain differently
- Remember user preferences and personalize responses
- If the user tells you their name, use it warmly
- If the user mentions family members, remember them for future conversations`;

// Memory context that gets sent to the gateway
let currentMemoryContext = '';

/**
 * Transcribe audio via the secure gateway
 * @param audioPath - Path to the audio file
 * @param language - Language code for Whisper (e.g., 'en', 'hi', 'mr')
 */
export async function transcribeAudio(audioPath: string, language: string = 'en'): Promise<string> {
  try {
    // For React Native, we need to create a blob from the file path
    const response = await fetch(audioPath);
    const audioBlob = await response.blob();

    const transcription = await transcribeViaGateway(audioBlob, language);
    return transcription;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    telemetryService.trackSTTFailure('transcription_error', errorMessage);
    console.error('Transcription error:', errorMessage);
    throw new Error('Could not understand the audio. Please try speaking again.');
  }
}

/**
 * Chat via the secure gateway
 */
export async function chat(
  messages: OpenAIMessage[],
  includeSystemPrompt: boolean = true
): Promise<string> {
  try {
    // Gateway handles the system prompt, but we send memory context
    const response = await sendChatMessage(
      messages,
      includeSystemPrompt ? currentMemoryContext : undefined
    );
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    telemetryService.trackChatError('chat_error');
    console.error('Chat error:', errorMessage);
    throw error; // Re-throw - the gateway API already provides user-friendly messages
  }
}

export async function chatWithRetry(
  messages: OpenAIMessage[],
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await chat(messages);
    } catch (error) {
      lastError = error as Error;

      if (
        lastError.message.includes('Invalid API key') ||
        lastError.message.includes('Too many requests')
      ) {
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed after multiple attempts.');
}

export function getSystemPrompt(): string {
  // System prompt is now server-side; return base + memory for reference
  return BASE_SYSTEM_PROMPT + (currentMemoryContext || '');
}

export function getBaseSystemPrompt(): string {
  return BASE_SYSTEM_PROMPT;
}

/**
 * Update the memory context that gets sent to the gateway
 * The gateway will combine this with its own safety-enhanced system prompt
 */
export function updateSystemPromptWithMemory(memoryContext: string): void {
  if (memoryContext && memoryContext.trim()) {
    currentMemoryContext = memoryContext;
  } else {
    currentMemoryContext = '';
  }
}

/**
 * OpenAI service class for more complex operations
 */
class OpenAIService {
  async chat(messages: OpenAIMessage[]): Promise<string> {
    return chat(messages, true);
  }

  async transcribe(audioPath: string, language: string = 'en'): Promise<string> {
    return transcribeAudio(audioPath, language);
  }

  updateMemoryContext(memoryContext: string): void {
    updateSystemPromptWithMemory(memoryContext);
  }
}

export const openAIService = new OpenAIService();
