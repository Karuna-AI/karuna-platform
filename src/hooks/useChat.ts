import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Message, OpenAIMessage } from '../types';
import { chatWithRetry, updateSystemPromptWithMemory } from '../services/openai';
import { parseIntent, isActionableIntent } from '../services/intents';
import { storageService } from '../services/storage';
import { memoryService } from '../services/memory';
import { detectVaultQuery, executeVaultQuery, getVaultContextForAI } from '../services/vaultTools';
import { vaultService } from '../services/vault';
import { detectHealthQuery, executeHealthQuery, getHealthContextForAI } from '../services/healthChatTools';
import { weatherService } from '../services/weather';

interface UseChatOptions {
  onResponse?: (response: string) => void;
  onError?: (error: string) => void;
  onIntentDetected?: (intent: ReturnType<typeof parseIntent>) => void;
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingHistory: boolean;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  retryLastMessage: () => Promise<void>;
  injectMessage: (role: Message['role'], content: string) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { onResponse, onError, onIntentDetected } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const isInitialized = useRef(false);

  // Load messages and memory on mount
  useEffect(() => {
    async function loadData() {
      if (isInitialized.current) return;
      isInitialized.current = true;

      try {
        // Load saved messages
        const savedMessages = await storageService.loadMessages();
        if (savedMessages.length > 0) {
          setMessages(savedMessages);
          console.debug(`Loaded ${savedMessages.length} messages from storage`);
        }

        // Load memory and update system prompt
        const memoryContext = await memoryService.formatMemoryForPrompt();
        if (memoryContext) {
          updateSystemPromptWithMemory(memoryContext);
          console.debug('Memory context loaded into system prompt');
        }
      } catch (err) {
        console.error('Error loading chat history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadData();
  }, []);

  // Save messages whenever they change
  useEffect(() => {
    if (!isLoadingHistory && messages.length > 0) {
      storageService.saveMessages(messages);
    }
  }, [messages, isLoadingHistory]);

  const openAIMessages = useMemo((): OpenAIMessage[] => {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));
  }, [messages]);

  const addMessage = useCallback(
    (role: Message['role'], content: string): Message => {
      const newMessage: Message = {
        id: generateId(),
        role,
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, newMessage]);
      return newMessage;
    },
    []
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        return;
      }

      setError(null);
      setLastUserMessage(text);

      // Quick memory extraction for common patterns (no API call)
      memoryService.quickExtract(text).catch((err) => {
        console.error('Quick memory extraction error:', err);
      });

      const intent = parseIntent(text);
      if (onIntentDetected && isActionableIntent(intent)) {
        onIntentDetected(intent);
      }

      addMessage('user', text);
      setIsLoading(true);

      try {
        // Check if this is a health-related query
        const healthQuery = detectHealthQuery(text);

        if (healthQuery) {
          const healthResult = await executeHealthQuery(healthQuery);

          if (healthResult.success && healthResult.message) {
            // Use health data to form response
            addMessage('assistant', healthResult.message);
            onResponse?.(healthResult.message);
            setIsLoading(false);
            return;
          } else if (healthResult.requiresConsent) {
            // Inform user about consent requirement
            addMessage('assistant', healthResult.message);
            onResponse?.(healthResult.message);
            setIsLoading(false);
            return;
          }
        }

        // Check if this is a vault-related query
        const vaultQuery = detectVaultQuery(text);

        if (vaultQuery && vaultService.isUnlocked()) {
          // Execute vault lookup
          const vaultResult = await executeVaultQuery(vaultQuery);

          if (vaultResult.success && vaultResult.data) {
            // Use vault data to form response
            addMessage('assistant', vaultResult.message);
            onResponse?.(vaultResult.message);
            setIsLoading(false);
            return;
          }
        }

        // If queries weren't handled or failed, proceed with normal chat
        // Add vault and health context to help AI know what's available
        let vaultContext = '';
        if (vaultService.isUnlocked()) {
          vaultContext = await getVaultContextForAI();
        }

        const healthContext = await getHealthContextForAI();

        // Add weather context if available
        let weatherContext = '';
        try {
          const weather = await weatherService.getCurrentWeather();
          if (weather && !weather.isSimulated) {
            weatherContext = `\n[Current weather: ${Math.round(weather.temperature)}°F, ${weather.description}, feels like ${Math.round(weather.feelsLike)}°F, humidity ${weather.humidity}%, in ${weather.location.city}]`;
          }
        } catch {
          // Weather context is optional
        }

        const messagesForAPI: OpenAIMessage[] = [
          ...openAIMessages,
          { role: 'user', content: text + vaultContext + healthContext + weatherContext },
        ];

        const response = await chatWithRetry(messagesForAPI);

        addMessage('assistant', response);
        onResponse?.(response);

        // Process conversation for deeper memory extraction (every N turns)
        // This runs in background and doesn't block the response
        const updatedMessages = [...messages, { id: '', role: 'user' as const, content: text, timestamp: Date.now() }, { id: '', role: 'assistant' as const, content: response, timestamp: Date.now() }];
        memoryService.processConversation(updatedMessages).then(async () => {
          // Update system prompt with any new memory
          const memoryContext = await memoryService.formatMemoryForPrompt();
          if (memoryContext) {
            updateSystemPromptWithMemory(memoryContext);
          }
        }).catch((err) => {
          console.error('Memory processing error:', err);
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.';
        setError(errorMessage);
        onError?.(errorMessage);

        addMessage(
          'assistant',
          "I'm sorry, I'm having trouble right now. Please try again in a moment."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [openAIMessages, addMessage, onResponse, onError, onIntentDetected, messages]
  );

  const clearMessages = useCallback(async () => {
    setMessages([]);
    setError(null);
    setLastUserMessage(null);
    // Clear storage but keep memory
    await storageService.clearMessages();
    console.debug('Chat history cleared');
  }, []);

  const retryLastMessage = useCallback(async () => {
    if (lastUserMessage) {
      setMessages((prev) => {
        const lastUserIndex = prev.map((m) => m.role).lastIndexOf('user');
        if (lastUserIndex !== -1) {
          return prev.slice(0, lastUserIndex);
        }
        return prev;
      });

      await sendMessage(lastUserMessage);
    }
  }, [lastUserMessage, sendMessage]);

  const injectMessage = useCallback(
    (role: Message['role'], content: string) => {
      addMessage(role, content);
    },
    [addMessage]
  );

  return {
    messages,
    isLoading,
    isLoadingHistory,
    error,
    sendMessage,
    clearMessages,
    retryLastMessage,
    injectMessage,
  };
}

export default useChat;
