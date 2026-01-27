/**
 * AI Message Crafter
 * Generates personalized check-in messages with strict guardrails
 */

import { chatWithRetry } from './openai';
import { OpenAIMessage } from '../types';
import {
  Signal,
  CheckInType,
  AIMessageRequest,
  AIMessageResponse,
  StepsSignal,
  WeatherSignal,
  MedicationSignal,
  CHECK_IN_TYPE_INFO,
} from '../types/proactive';

// Guardrails for AI message generation
const MESSAGE_GUARDRAILS = {
  maxLength: 150,
  minLength: 20,
  forbiddenTopics: [
    'death',
    'dying',
    'end of life',
    'terminal',
    'will',
    'funeral',
    'politics',
    'religion',
    'money',
    'finances',
    'debt',
  ],
  requiredTone: [
    'warm',
    'supportive',
    'encouraging',
    'gentle',
    'caring',
  ],
  avoidPatterns: [
    /you should/gi,
    /you must/gi,
    /you need to/gi,
    /don't forget/gi,
    /remember to/gi,
  ],
};

// Pre-approved message templates for fallback
const FALLBACK_MESSAGES: Record<CheckInType, string[]> = {
  step_nudge: [
    "A short walk might feel nice right about now. Even just a few steps can make a difference!",
    "How about stretching your legs a bit? The fresh air could be refreshing.",
    "When you have a moment, a little movement can help you feel more energized.",
  ],
  weather_alert: [
    "The weather outside needs some attention today. Please take care!",
    "Just a heads up about the weather - you might want to plan accordingly.",
    "Weather conditions are worth noting today. Stay comfortable!",
  ],
  medication_reminder: [
    "This is a gentle reminder about your medications. Taking them regularly helps you stay healthy.",
    "Have you had a chance to take your medications? They're an important part of your daily routine.",
    "Just checking in about your medications. Let me know if you need any help!",
  ],
  appointment_reminder: [
    "You have something on your calendar coming up. Would you like me to tell you more?",
    "Just a friendly reminder about your upcoming appointment. I'm here if you need help preparing.",
    "There's an appointment to remember today. Let me know if you need any details!",
  ],
  wellbeing_check: [
    "Hi there! I just wanted to check in and see how you're doing today.",
    "Hello! Hope you're having a nice day. How are you feeling?",
    "Just stopping by to say hi and see how things are going for you.",
  ],
  inactivity_check: [
    "Haven't heard from you in a bit - just checking to make sure everything is okay!",
    "Hi! It's been quiet for a while. Just wanted to make sure you're doing alright.",
    "Checking in to see how you're doing. Everything okay on your end?",
  ],
  hydration_reminder: [
    "Have you had some water lately? Staying hydrated is so important!",
    "This is your friendly reminder to drink some water. Your body will thank you!",
    "How about a nice glass of water? Keeping hydrated helps you feel your best.",
  ],
  rest_suggestion: [
    "You've been active! Maybe it's a good time for a little rest.",
    "Taking breaks is important. How about a moment to relax?",
    "A little rest can go a long way. You deserve a break!",
  ],
};

class AIMessageCrafterService {
  /**
   * Generate a personalized message for a check-in
   */
  async craftMessage(request: AIMessageRequest): Promise<AIMessageResponse> {
    try {
      // First, try AI-generated message
      const aiMessage = await this.generateAIMessage(request);

      // Validate the message against guardrails
      const validationResult = this.validateMessage(aiMessage);

      if (validationResult.isValid) {
        return {
          message: aiMessage,
          confidence: 0.9,
        };
      }

      // If AI message fails validation, use fallback
      console.log('[AIMessageCrafter] AI message failed validation:', validationResult.reason);
      return this.getFallbackMessage(request.checkInType);
    } catch (error) {
      console.error('[AIMessageCrafter] Error generating message:', error);
      return this.getFallbackMessage(request.checkInType);
    }
  }

  /**
   * Generate message using AI
   */
  private async generateAIMessage(request: AIMessageRequest): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = this.buildUserPrompt(request);

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await chatWithRetry(messages);
    return response.trim();
  }

  /**
   * Build system prompt with guardrails
   */
  private buildSystemPrompt(request: AIMessageRequest): string {
    const typeInfo = CHECK_IN_TYPE_INFO[request.checkInType];

    return `You are Karuna, a warm and caring AI assistant for elderly users. You're generating a brief check-in message.

STRICT GUIDELINES:
- Keep messages between ${MESSAGE_GUARDRAILS.minLength} and ${MESSAGE_GUARDRAILS.maxLength} characters
- Use a ${request.constraints.tone}, supportive tone
- NEVER be condescending or talk down to the user
- NEVER mention death, dying, illness severity, finances, politics, or religion
- NEVER use phrases like "you should", "you must", "don't forget" - instead use gentle suggestions
- Address the user warmly but not patronizingly
- Be conversational, not clinical
- Focus on the positive action, not the problem
- One clear message only - no multiple paragraphs

The message is a ${typeInfo.displayName.toLowerCase()} (${typeInfo.icon}).
Time of day: ${request.userContext.timeOfDay}.
${request.userContext.name ? `User's name: ${request.userContext.name}` : ''}`;
  }

  /**
   * Build user prompt with signal context
   */
  private buildUserPrompt(request: AIMessageRequest): string {
    const signalContext = this.formatSignalsForPrompt(request.signals);

    return `Generate a brief, caring check-in message based on these signals:
${signalContext}

Remember: ${MESSAGE_GUARDRAILS.maxLength} characters max. Be warm but not patronizing.`;
  }

  /**
   * Format signals for AI prompt
   */
  private formatSignalsForPrompt(signals: Signal[]): string {
    const lines: string[] = [];

    for (const signal of signals) {
      switch (signal.type) {
        case 'steps':
          const steps = signal as StepsSignal;
          lines.push(`- Steps: ${steps.value.current} of ${steps.value.goal} goal (${steps.value.percentage}%)`);
          break;
        case 'weather':
          const weather = signal as WeatherSignal;
          lines.push(`- Weather: ${weather.value.temperature}°F, ${weather.value.condition}`);
          break;
        case 'medication':
          const meds = signal as MedicationSignal;
          if (meds.value.nextDose) {
            lines.push(`- Next medication: ${meds.value.nextDose.name} at ${meds.value.nextDose.time}`);
          }
          if (meds.value.missedDoses > 0) {
            lines.push(`- Missed doses today: ${meds.value.missedDoses}`);
          }
          break;
      }
    }

    return lines.join('\n') || 'No specific signals';
  }

  /**
   * Validate message against guardrails
   */
  private validateMessage(message: string): { isValid: boolean; reason?: string } {
    // Check length
    if (message.length < MESSAGE_GUARDRAILS.minLength) {
      return { isValid: false, reason: 'Message too short' };
    }
    if (message.length > MESSAGE_GUARDRAILS.maxLength * 1.5) { // Allow some flexibility
      return { isValid: false, reason: 'Message too long' };
    }

    // Check forbidden topics
    const lowerMessage = message.toLowerCase();
    for (const topic of MESSAGE_GUARDRAILS.forbiddenTopics) {
      if (lowerMessage.includes(topic)) {
        return { isValid: false, reason: `Contains forbidden topic: ${topic}` };
      }
    }

    // Check avoid patterns
    for (const pattern of MESSAGE_GUARDRAILS.avoidPatterns) {
      if (pattern.test(message)) {
        return { isValid: false, reason: `Contains discouraged pattern: ${pattern}` };
      }
    }

    // Check for overly clinical language
    const clinicalTerms = ['patient', 'condition', 'symptoms', 'diagnosis', 'treatment'];
    for (const term of clinicalTerms) {
      if (lowerMessage.includes(term)) {
        return { isValid: false, reason: `Too clinical: ${term}` };
      }
    }

    return { isValid: true };
  }

  /**
   * Get a fallback message when AI fails
   */
  private getFallbackMessage(type: CheckInType): AIMessageResponse {
    const messages = FALLBACK_MESSAGES[type] || FALLBACK_MESSAGES.wellbeing_check;
    const randomIndex = Math.floor(Math.random() * messages.length);

    return {
      message: messages[randomIndex],
      confidence: 0.7,
    };
  }

  /**
   * Enhance a template message with personalization
   */
  enhanceMessage(
    template: string,
    userContext: AIMessageRequest['userContext']
  ): string {
    let message = template;

    // Add time-appropriate greeting if message starts with a greeting placeholder
    if (message.includes('{{greeting}}')) {
      const greetings: Record<string, string> = {
        morning: 'Good morning',
        afternoon: 'Good afternoon',
        evening: 'Good evening',
        night: 'Hi there',
      };
      message = message.replace('{{greeting}}', greetings[userContext.timeOfDay]);
    }

    // Add name if available and appropriate
    if (userContext.name && message.includes('{{name}}')) {
      message = message.replace('{{name}}', userContext.name);
    }

    return message;
  }

  /**
   * Generate a follow-up message based on user response
   */
  async craftFollowUp(
    originalType: CheckInType,
    userResponse: 'positive' | 'negative' | 'neutral',
    userContext: AIMessageRequest['userContext']
  ): Promise<string> {
    const followUps: Record<string, Record<string, string[]>> = {
      positive: {
        step_nudge: ["That's wonderful! Enjoy your walk!", "Great! Every step counts!"],
        medication_reminder: ["Perfect! Taking care of yourself is so important.", "Wonderful! Keep up the great routine!"],
        wellbeing_check: ["So glad to hear that! Have a lovely day!", "That makes me happy to hear!"],
        default: ["That's great!", "Wonderful to hear!"],
      },
      negative: {
        wellbeing_check: ["I'm sorry to hear that. Remember, I'm here if you need to talk.", "That's okay. Would you like me to call someone?"],
        inactivity_check: ["Is there anything I can help with? I'm here for you.", "Would you like me to reach out to your caregiver?"],
        default: ["That's okay. Let me know if you need anything.", "No worries at all. I'm here when you need me."],
      },
      neutral: {
        default: ["Sounds good! I'm here if you need me.", "Alright! Just let me know if anything comes up."],
      },
    };

    const typeFollowUps = followUps[userResponse][originalType] || followUps[userResponse].default;
    const randomIndex = Math.floor(Math.random() * typeFollowUps.length);

    return typeFollowUps[randomIndex];
  }
}

export const aiMessageCrafterService = new AIMessageCrafterService();
export default aiMessageCrafterService;
