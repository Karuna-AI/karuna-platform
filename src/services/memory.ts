import { Message } from '../types';
import { storageService, UserMemory, KeyPerson, StoredMessage } from './storage';
import { openAIService } from './openai';

// How many turns before generating a summary
const SUMMARY_INTERVAL = 6;

/**
 * Memory service - extracts and maintains user memory from conversations
 */
class MemoryService {
  private isProcessing = false;

  /**
   * Check if it's time to generate a summary
   */
  async shouldGenerateSummary(currentMessageCount: number): Promise<boolean> {
    const lastIndex = await storageService.getLastSummaryIndex();
    return currentMessageCount - lastIndex >= SUMMARY_INTERVAL;
  }

  /**
   * Process recent messages and update memory
   */
  async processConversation(messages: Message[]): Promise<void> {
    if (this.isProcessing || messages.length < 2) {
      return;
    }

    this.isProcessing = true;

    try {
      const shouldSummarize = await this.shouldGenerateSummary(messages.length);

      if (shouldSummarize) {
        // Get messages since last summary
        const lastIndex = await storageService.getLastSummaryIndex();
        const newMessages = messages.slice(lastIndex);

        if (newMessages.length >= 2) {
          await this.extractMemoryFromMessages(newMessages);
          await storageService.setLastSummaryIndex(messages.length);
        }
      }
    } catch (error) {
      console.error('Error processing conversation for memory:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Extract memory updates from a set of messages using GPT
   */
  private async extractMemoryFromMessages(messages: Message[]): Promise<void> {
    const currentMemory = await storageService.loadMemory();

    // Format messages for analysis
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const extractionPrompt = `Analyze this conversation and extract any user preferences or important information to remember.

CONVERSATION:
${conversationText}

CURRENT MEMORY:
${JSON.stringify(currentMemory, null, 2)}

Extract and return a JSON object with ONLY the NEW information found (leave fields empty if no new info):
{
  "preferredName": "name the user wants to be called, or null",
  "newPeople": [{"name": "...", "relationship": "...", "nickname": "optional nickname"}],
  "preferences": {
    "speechRate": "slower/normal/faster or null",
    "language": "language preference or null"
  },
  "customInstructions": ["any specific requests like 'always speak Hindi', 'remind me about medications'"]
}

IMPORTANT:
- Only include NEW information not already in current memory
- If user says "call me [name]" or "my name is [name]", that's preferredName
- If user mentions "my son [name]", "my daughter [name]", etc., add to newPeople
- If user says "speak slower/faster", update speechRate
- Return valid JSON only, no explanation`;

    try {
      const response = await openAIService.chat([
        { role: 'system', content: 'You are a memory extraction assistant. Return only valid JSON.' },
        { role: 'user', content: extractionPrompt },
      ]);

      // Parse the response
      const extracted = this.parseMemoryResponse(response);

      if (extracted) {
        await this.applyMemoryUpdates(extracted, currentMemory);
      }
    } catch (error) {
      console.error('Error extracting memory:', error);
    }
  }

  /**
   * Parse the GPT response for memory extraction
   */
  private parseMemoryResponse(response: string): any | null {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      console.error('Error parsing memory response:', error);
      return null;
    }
  }

  /**
   * Apply extracted memory updates to storage
   */
  private async applyMemoryUpdates(extracted: any, currentMemory: UserMemory): Promise<void> {
    const updates: Partial<UserMemory> = {};

    // Update preferred name
    if (extracted.preferredName && extracted.preferredName !== currentMemory.preferredName) {
      updates.preferredName = extracted.preferredName;
      console.debug('Memory: Updated preferred name to', extracted.preferredName);
    }

    // Add new people
    if (extracted.newPeople && Array.isArray(extracted.newPeople)) {
      for (const person of extracted.newPeople) {
        if (person.name && person.relationship) {
          await storageService.addKeyPerson(person as KeyPerson);
          console.debug('Memory: Added key person', person.name, '-', person.relationship);
        }
      }
    }

    // Update preferences
    if (extracted.preferences) {
      const newPrefs = { ...currentMemory.preferences };
      let prefsChanged = false;

      if (extracted.preferences.speechRate) {
        newPrefs.speechRate = extracted.preferences.speechRate;
        prefsChanged = true;
        console.debug('Memory: Updated speech rate to', extracted.preferences.speechRate);
      }

      if (extracted.preferences.language) {
        newPrefs.language = extracted.preferences.language;
        prefsChanged = true;
        console.debug('Memory: Updated language to', extracted.preferences.language);
      }

      if (prefsChanged) {
        updates.preferences = newPrefs;
      }
    }

    // Add custom instructions
    if (extracted.customInstructions && Array.isArray(extracted.customInstructions)) {
      for (const instruction of extracted.customInstructions) {
        if (instruction && typeof instruction === 'string') {
          await storageService.addCustomInstruction(instruction);
          console.debug('Memory: Added custom instruction:', instruction);
        }
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await storageService.updateMemory(updates);
    }
  }

  /**
   * Quick extraction for immediate preferences (without API call)
   * Used for common patterns like "speak slower" or "call me [name]"
   */
  async quickExtract(userMessage: string): Promise<void> {
    const lower = userMessage.toLowerCase();

    // Speed preferences
    if (lower.includes('speak slower') || lower.includes('talk slower') || lower.includes('slow down')) {
      const memory = await storageService.loadMemory();
      memory.preferences.speechRate = 'slower';
      await storageService.saveMemory(memory);
      console.debug('Quick extract: Set speech rate to slower');
    } else if (lower.includes('speak faster') || lower.includes('talk faster') || lower.includes('speed up')) {
      const memory = await storageService.loadMemory();
      memory.preferences.speechRate = 'faster';
      await storageService.saveMemory(memory);
      console.debug('Quick extract: Set speech rate to faster');
    }

    // Name extraction: "call me X" or "my name is X"
    const nameMatch = lower.match(/(?:call me|my name is|i am|i'm)\s+([a-z]+)/i);
    if (nameMatch) {
      const name = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
      await storageService.updateMemory({ preferredName: name });
      console.debug('Quick extract: Set preferred name to', name);
    }

    // Relationship extraction: "my [relationship] is [name]" or "my [relationship] [name]"
    const relationshipMatch = lower.match(
      /my\s+(son|daughter|wife|husband|mother|mom|father|dad|brother|sister|grandson|granddaughter)\s+(?:is\s+)?([a-z]+)/i
    );
    if (relationshipMatch) {
      const relationship = relationshipMatch[1];
      const name = relationshipMatch[2].charAt(0).toUpperCase() + relationshipMatch[2].slice(1);
      await storageService.addKeyPerson({ name, relationship });
      console.debug('Quick extract: Added', relationship, name);
    }

    // Nickname: "call my [relationship] [nickname]" or "[name] as [nickname]"
    const nicknameMatch = lower.match(
      /call\s+(?:my\s+)?(son|daughter|wife|husband|mother|mom|father|dad)\s+(?:as\s+)?['"]?([a-z]+)['"]?/i
    );
    if (nicknameMatch) {
      const relationship = nicknameMatch[1];
      const nickname = nicknameMatch[2].charAt(0).toUpperCase() + nicknameMatch[2].slice(1);

      const memory = await storageService.loadMemory();
      const personIndex = memory.keyPeople.findIndex(
        (p) => p.relationship.toLowerCase() === relationship.toLowerCase()
      );

      if (personIndex >= 0) {
        memory.keyPeople[personIndex].nickname = nickname;
        await storageService.saveMemory(memory);
        console.debug('Quick extract: Set nickname for', relationship, 'to', nickname);
      } else {
        // Create new entry with nickname
        await storageService.addKeyPerson({ name: nickname, relationship, nickname });
      }
    }
  }

  /**
   * Format memory for system prompt injection
   */
  async formatMemoryForPrompt(): Promise<string> {
    const memory = await storageService.loadMemory();
    const parts: string[] = [];

    // Preferred name
    if (memory.preferredName) {
      parts.push(`The user prefers to be called "${memory.preferredName}".`);
    }

    // Key people
    if (memory.keyPeople.length > 0) {
      const peopleList = memory.keyPeople
        .map((p) => {
          let desc = `${p.relationship}: ${p.name}`;
          if (p.nickname) {
            desc += ` (also called "${p.nickname}")`;
          }
          return desc;
        })
        .join(', ');
      parts.push(`Important people in the user's life: ${peopleList}.`);
    }

    // Preferences
    if (memory.preferences.speechRate) {
      const rateDesc =
        memory.preferences.speechRate === 'slower'
          ? 'The user prefers you to speak slower and more clearly.'
          : memory.preferences.speechRate === 'faster'
          ? 'The user is comfortable with a faster speaking pace.'
          : '';
      if (rateDesc) parts.push(rateDesc);
    }

    if (memory.preferences.language) {
      parts.push(`The user prefers communication in ${memory.preferences.language}.`);
    }

    // Custom instructions
    if (memory.customInstructions.length > 0) {
      parts.push(`User's specific requests: ${memory.customInstructions.join('; ')}.`);
    }

    // Recent reminders context
    const recentReminders = memory.remindersCreated.slice(-3);
    if (recentReminders.length > 0) {
      const reminderList = recentReminders.map((r) => r.message).join(', ');
      parts.push(`Recently set reminders: ${reminderList}.`);
    }

    return parts.length > 0
      ? `\n\n[USER MEMORY]\n${parts.join('\n')}\n[END USER MEMORY]`
      : '';
  }

  /**
   * Get summary of memory for display
   */
  async getMemorySummary(): Promise<string> {
    const memory = await storageService.loadMemory();
    const lines: string[] = [];

    if (memory.preferredName) {
      lines.push(`Name: ${memory.preferredName}`);
    }

    if (memory.keyPeople.length > 0) {
      lines.push(`Key people: ${memory.keyPeople.length}`);
      memory.keyPeople.forEach((p) => {
        lines.push(`  - ${p.relationship}: ${p.name}${p.nickname ? ` ("${p.nickname}")` : ''}`);
      });
    }

    if (memory.preferences.speechRate) {
      lines.push(`Speech: ${memory.preferences.speechRate}`);
    }

    if (memory.customInstructions.length > 0) {
      lines.push(`Custom instructions: ${memory.customInstructions.length}`);
    }

    return lines.length > 0 ? lines.join('\n') : 'No memories stored yet.';
  }
}

export const memoryService = new MemoryService();
export default memoryService;
