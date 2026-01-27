import { Linking, Platform, Alert } from 'react-native';
import { Contact, contactsService } from './contacts';
import { ParsedIntent, IntentType } from '../types';
import { telemetryService } from './telemetry';
import { appLauncherService } from './appLauncher';
import { otpAssistantService } from './otpAssistant';
import { ActionRequest, ActionResult, ActionConfirmation } from '../types/actions';

export interface IntentActionResult {
  success: boolean;
  message: string;
  requiresConfirmation?: boolean;
  confirmationData?: ConfirmationData;
  actionConfirmation?: ActionConfirmation;
}

export interface ConfirmationData {
  type: 'call' | 'message' | 'reminder';
  title: string;
  description: string;
  contact?: Contact;
  phoneNumber?: string;
  messageContent?: string;
  reminderTime?: string;
  reminderMessage?: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export interface PendingReminder {
  id: string;
  message: string;
  time: Date;
  notificationId?: string;
}

/**
 * Intent Actions Service - Executes real actions for detected intents
 */
class IntentActionsService {
  private pendingReminders: PendingReminder[] = [];

  /**
   * Process an intent and prepare for action
   */
  async processIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    switch (intent.type) {
      case 'call':
        return this.processCallIntent(intent);
      case 'message':
        return this.processMessageIntent(intent);
      case 'reminder':
        return this.processReminderIntent(intent);
      // Phase 13: New action types
      case 'ride_request':
        return this.processRideIntent(intent);
      case 'navigation':
        return this.processNavigationIntent(intent);
      case 'youtube':
        return this.processYouTubeIntent(intent);
      case 'music':
        return this.processMusicIntent(intent);
      case 'otp_help':
        return this.processOTPIntent(intent);
      case 'emergency':
        return this.processEmergencyIntent(intent);
      case 'whatsapp':
        return this.processWhatsAppIntent(intent);
      default:
        return {
          success: false,
          message: 'This intent type is not supported for actions.',
        };
    }
  }

  /**
   * Process call intent
   */
  private async processCallIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const contactName = intent.entities.contact;

    if (!contactName) {
      return {
        success: false,
        message: 'I didn\'t catch who you want to call. Could you say the name again?',
      };
    }

    // Load contacts if not already loaded
    if (!contactsService.isContactsLoaded()) {
      await contactsService.loadContacts();
    }

    // Try to find by relationship first (e.g., "my son")
    let results = contactsService.findByRelationship(contactName);

    // If no relationship match, search by name
    if (results.length === 0) {
      results = contactsService.searchContacts(contactName);
    }

    if (results.length === 0) {
      return {
        success: false,
        message: `I couldn't find "${contactName}" in your contacts. Would you like to try a different name?`,
      };
    }

    if (results.length === 1 || results[0].matchScore > 0.8) {
      // Single clear match - prepare confirmation
      const contact = results[0].contact;
      const phoneNumber = contact.phoneNumbers[0];

      return {
        success: true,
        message: `Found ${contact.name}`,
        requiresConfirmation: true,
        confirmationData: {
          type: 'call',
          title: `Call ${contact.name}?`,
          description: `This will open your phone to call ${phoneNumber}`,
          contact,
          phoneNumber,
          onConfirm: async () => {
            await this.executeCall(phoneNumber);
          },
          onCancel: () => {},
        },
      };
    }

    // Multiple matches - need to pick one
    return {
      success: true,
      message: `Found ${results.length} contacts matching "${contactName}"`,
      requiresConfirmation: true,
      confirmationData: {
        type: 'call',
        title: 'Which contact?',
        description: `I found several people named "${contactName}". Please select one:`,
        onConfirm: async () => {},
        onCancel: () => {},
      },
    };
  }

  /**
   * Process message intent
   */
  private async processMessageIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const contactName = intent.entities.contact;
    const messageContent = intent.entities.message || '';

    if (!contactName) {
      return {
        success: false,
        message: 'I didn\'t catch who you want to message. Could you say the name again?',
      };
    }

    // Load contacts if not already loaded
    if (!contactsService.isContactsLoaded()) {
      await contactsService.loadContacts();
    }

    // Try to find contact
    let results = contactsService.findByRelationship(contactName);
    if (results.length === 0) {
      results = contactsService.searchContacts(contactName);
    }

    if (results.length === 0) {
      return {
        success: false,
        message: `I couldn't find "${contactName}" in your contacts. Would you like to try a different name?`,
      };
    }

    const contact = results[0].contact;
    const phoneNumber = contact.phoneNumbers[0];

    return {
      success: true,
      message: `Ready to message ${contact.name}`,
      requiresConfirmation: true,
      confirmationData: {
        type: 'message',
        title: `Message ${contact.name}?`,
        description: messageContent
          ? `Message: "${messageContent}"`
          : 'This will open your messaging app',
        contact,
        phoneNumber,
        messageContent,
        onConfirm: async () => {
          await this.executeMessage(phoneNumber, messageContent);
        },
        onCancel: () => {},
      },
    };
  }

  /**
   * Process reminder intent
   */
  private async processReminderIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const reminderMessage = intent.entities.message || intent.rawText;
    const timeString = intent.entities.time;

    // Parse time from string
    const reminderTime = this.parseTimeString(timeString);

    if (!reminderTime) {
      return {
        success: true,
        message: 'I\'ll set a reminder for you',
        requiresConfirmation: true,
        confirmationData: {
          type: 'reminder',
          title: 'Set Reminder',
          description: `"${reminderMessage}"`,
          reminderMessage,
          reminderTime: 'Not specified - please select a time',
          onConfirm: async () => {
            // This will be handled by the UI to let user pick time
          },
          onCancel: () => {},
        },
      };
    }

    const formattedTime = this.formatTime(reminderTime);

    return {
      success: true,
      message: `Reminder for ${formattedTime}`,
      requiresConfirmation: true,
      confirmationData: {
        type: 'reminder',
        title: 'Set Reminder?',
        description: `"${reminderMessage}" at ${formattedTime}`,
        reminderMessage,
        reminderTime: formattedTime,
        onConfirm: async () => {
          await this.executeReminder(reminderMessage, reminderTime);
        },
        onCancel: () => {},
      },
    };
  }

  /**
   * Execute a phone call via tel: deep link
   */
  async executeCall(phoneNumber: string): Promise<boolean> {
    try {
      const url = `tel:${phoneNumber.replace(/\s/g, '')}`;
      const canOpen = await Linking.canOpenURL(url);

      if (canOpen) {
        await Linking.openURL(url);
        // Track successful call execution (no PII - just the action type)
        telemetryService.track('action_cancelled', { errorType: 'call_executed' });
        return true;
      } else {
        Alert.alert(
          'Cannot Make Call',
          'Your device cannot make phone calls. Please check your phone settings.',
          [{ text: 'OK' }]
        );
        telemetryService.trackAppError('call_not_supported', 'intentActions');
        return false;
      }
    } catch (error) {
      console.error('Call error:', error);
      Alert.alert(
        'Call Failed',
        'There was a problem making the call. Please try again.',
        [{ text: 'OK' }]
      );
      telemetryService.trackAppError('call_failed', 'intentActions');
      return false;
    }
  }

  /**
   * Execute emergency call - tracked separately for safety monitoring
   */
  async executeEmergencyCall(emergencyNumber: string = '911'): Promise<boolean> {
    try {
      const url = `tel:${emergencyNumber}`;
      const canOpen = await Linking.canOpenURL(url);

      if (canOpen) {
        await Linking.openURL(url);
        telemetryService.trackEmergencyCall(true);
        return true;
      } else {
        telemetryService.trackEmergencyCall(false);
        Alert.alert(
          'Emergency Call',
          `Please call ${emergencyNumber} directly from your phone.`,
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('Emergency call error:', error);
      telemetryService.trackEmergencyCall(false);
      return false;
    }
  }

  /**
   * Execute SMS message via sms: deep link
   */
  async executeMessage(phoneNumber: string, message?: string): Promise<boolean> {
    try {
      // Try SMS first
      let url: string;

      if (Platform.OS === 'ios') {
        url = message
          ? `sms:${phoneNumber}&body=${encodeURIComponent(message)}`
          : `sms:${phoneNumber}`;
      } else {
        url = message
          ? `sms:${phoneNumber}?body=${encodeURIComponent(message)}`
          : `sms:${phoneNumber}`;
      }

      const canOpen = await Linking.canOpenURL(url);

      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }

      // Fallback to WhatsApp
      return this.executeWhatsApp(phoneNumber, message);
    } catch (error) {
      console.error('Message error:', error);
      telemetryService.trackAppError('message_failed', 'intentActions');
      return false;
    }
  }

  /**
   * Execute WhatsApp message
   */
  async executeWhatsApp(phoneNumber: string, message?: string): Promise<boolean> {
    try {
      // Remove non-numeric characters except +
      const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
      const url = message
        ? `whatsapp://send?phone=${cleanNumber}&text=${encodeURIComponent(message)}`
        : `whatsapp://send?phone=${cleanNumber}`;

      const canOpen = await Linking.canOpenURL(url);

      if (canOpen) {
        await Linking.openURL(url);
        return true;
      } else {
        Alert.alert(
          'WhatsApp Not Available',
          'WhatsApp is not installed on this device.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('WhatsApp error:', error);
      return false;
    }
  }

  /**
   * Execute reminder by scheduling a local notification
   */
  async executeReminder(message: string, time: Date): Promise<boolean> {
    try {
      const reminder: PendingReminder = {
        id: `reminder_${Date.now()}`,
        message,
        time,
      };

      // For web/testing, we'll use setTimeout
      // In production, use react-native-push-notification or notifee
      if (Platform.OS === 'web') {
        const delay = time.getTime() - Date.now();

        if (delay > 0) {
          setTimeout(() => {
            // Web notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Karuna Reminder', {
                body: message,
                icon: '/icon.png',
              });
            } else {
              Alert.alert('Reminder', message);
            }
          }, delay);

          // Request notification permission for web
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
        }

        this.pendingReminders.push(reminder);
        return true;
      }

      // For native, we would use a notification library here
      // This is a placeholder for native implementation
      this.pendingReminders.push(reminder);

      Alert.alert(
        'Reminder Set',
        `I'll remind you: "${message}" at ${this.formatTime(time)}`,
        [{ text: 'OK' }]
      );

      return true;
    } catch (error) {
      console.error('Reminder error:', error);
      return false;
    }
  }

  /**
   * Parse time string to Date object
   */
  private parseTimeString(timeString?: string): Date | null {
    if (!timeString) {
      return null;
    }

    const now = new Date();
    const lower = timeString.toLowerCase().trim();

    // Handle relative times
    if (lower.includes('minute')) {
      const match = lower.match(/(\d+)\s*minute/);
      if (match) {
        const minutes = parseInt(match[1], 10);
        return new Date(now.getTime() + minutes * 60 * 1000);
      }
    }

    if (lower.includes('hour')) {
      const match = lower.match(/(\d+)\s*hour/);
      if (match) {
        const hours = parseInt(match[1], 10);
        return new Date(now.getTime() + hours * 60 * 60 * 1000);
      }
    }

    // Handle specific times like "7pm", "7:30pm", "19:00"
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const period = timeMatch[3];

      if (period === 'pm' && hours < 12) {
        hours += 12;
      } else if (period === 'am' && hours === 12) {
        hours = 0;
      }

      const result = new Date(now);
      result.setHours(hours, minutes, 0, 0);

      // If the time has passed today, set for tomorrow
      if (result.getTime() <= now.getTime()) {
        result.setDate(result.getDate() + 1);
      }

      return result;
    }

    // Handle "in X minutes/hours"
    if (lower.includes('in ')) {
      const inMatch = lower.match(/in\s+(\d+)\s*(minute|hour|min|hr)/);
      if (inMatch) {
        const value = parseInt(inMatch[1], 10);
        const unit = inMatch[2];

        if (unit.startsWith('min')) {
          return new Date(now.getTime() + value * 60 * 1000);
        } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
          return new Date(now.getTime() + value * 60 * 60 * 1000);
        }
      }
    }

    return null;
  }

  /**
   * Format time for display
   */
  private formatTime(date: Date): string {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (isToday) {
      return `Today at ${timeStr}`;
    }

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    if (isTomorrow) {
      return `Tomorrow at ${timeStr}`;
    }

    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    return `${dateStr} at ${timeStr}`;
  }

  // ========================================
  // Phase 13: New Action Intent Processors
  // ========================================

  /**
   * Process ride request intent (Uber, Ola, Lyft)
   */
  private async processRideIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const destination = intent.entities.destination;
    const pickup = intent.entities.pickup;
    const provider = intent.entities.rideProvider || 'uber';

    if (!destination) {
      return {
        success: false,
        message: "Where would you like to go? Please tell me the destination.",
      };
    }

    // Map provider to action type
    const actionType = provider === 'ola' ? 'ola_ride'
      : provider === 'lyft' ? 'lyft_ride'
      : 'uber_ride';

    const request: ActionRequest = {
      type: actionType,
      params: {
        destination: { address: destination },
        pickup: pickup ? { address: pickup } : undefined,
      },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    // Get confirmation from app launcher
    const confirmation = appLauncherService.buildConfirmation(request);

    return {
      success: true,
      message: `Ready to book ${provider} to ${destination}`,
      requiresConfirmation: true,
      actionConfirmation: confirmation,
    };
  }

  /**
   * Process navigation intent (Maps, directions)
   */
  private async processNavigationIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const destination = intent.entities.destination;
    const query = intent.entities.query;

    if (!destination && !query) {
      return {
        success: false,
        message: "Where would you like directions to?",
      };
    }

    const request: ActionRequest = {
      type: query ? 'maps_search' : 'maps_navigate',
      params: {
        destination: destination ? { address: destination } : undefined,
        query,
      },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    const confirmation = appLauncherService.buildConfirmation(request);

    return {
      success: true,
      message: destination ? `Getting directions to ${destination}` : `Searching for ${query}`,
      requiresConfirmation: true,
      actionConfirmation: confirmation,
    };
  }

  /**
   * Process YouTube intent
   */
  private async processYouTubeIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const query = intent.entities.query;

    const request: ActionRequest = {
      type: query ? 'youtube_search' : 'youtube_play',
      params: { query: query || '' },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    const confirmation = appLauncherService.buildConfirmation(request);

    return {
      success: true,
      message: query ? `Searching YouTube for "${query}"` : 'Opening YouTube',
      requiresConfirmation: true,
      actionConfirmation: confirmation,
    };
  }

  /**
   * Process music intent (Spotify, general music)
   */
  private async processMusicIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const query = intent.entities.query || intent.entities.song;
    const artist = intent.entities.artist;

    const request: ActionRequest = {
      type: 'spotify_play',
      params: {
        query: query || '',
        artist,
      },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    const confirmation = appLauncherService.buildConfirmation(request);

    const displayText = artist && query
      ? `"${query}" by ${artist}`
      : query
        ? `"${query}"`
        : 'music';

    return {
      success: true,
      message: `Playing ${displayText}`,
      requiresConfirmation: true,
      actionConfirmation: confirmation,
    };
  }

  /**
   * Process OTP assistant intent
   */
  private async processOTPIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    // Validate request for safety
    const validation = otpAssistantService.validateRequest(intent.rawText);

    if (!validation.safe) {
      return {
        success: false,
        message: validation.warning || "I can't help with that for security reasons.",
      };
    }

    const source = intent.entities.otpSource;

    const confirmation: ActionConfirmation = {
      type: 'otp_assist',
      title: 'Read OTP Aloud?',
      description: source
        ? `I'll read your ${source} OTP code aloud. Make sure no one else is listening.`
        : "I'll read your OTP code aloud. Make sure no one else is listening.",
      icon: '🔢',
      details: [
        {
          label: 'Source',
          value: source || 'Clipboard',
          icon: '📱',
        },
      ],
      warnings: [
        'Never share your OTP with anyone who calls you',
        'OTPs expire quickly - enter it within a few minutes',
      ],
      actions: [
        { id: 'confirm', label: 'Read OTP', type: 'confirm', style: 'primary' },
        { id: 'cancel', label: 'Cancel', type: 'cancel', style: 'secondary' },
      ],
    };

    return {
      success: true,
      message: 'Ready to read your OTP',
      requiresConfirmation: true,
      actionConfirmation: confirmation,
    };
  }

  /**
   * Process emergency intent - HIGH PRIORITY
   */
  private async processEmergencyIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const confirmation: ActionConfirmation = {
      type: 'emergency_call',
      title: 'Call Emergency Services?',
      description: 'This will call emergency services (911). Only confirm if you need immediate help.',
      icon: '🚨',
      warnings: [
        'Only use for real emergencies',
        'Stay calm and provide your location',
      ],
      actions: [
        { id: 'confirm', label: 'Call Now', type: 'confirm', style: 'primary' },
        { id: 'cancel', label: 'Cancel', type: 'cancel', style: 'secondary' },
      ],
    };

    return {
      success: true,
      message: 'Emergency services will be called',
      requiresConfirmation: true,
      actionConfirmation: confirmation,
    };
  }

  /**
   * Process WhatsApp specific intent
   */
  private async processWhatsAppIntent(intent: ParsedIntent): Promise<IntentActionResult> {
    const contactName = intent.entities.contact;
    const messageContent = intent.entities.message || '';

    if (!contactName) {
      return {
        success: false,
        message: "Who would you like to WhatsApp?",
      };
    }

    // Load contacts if not already loaded
    if (!contactsService.isContactsLoaded()) {
      await contactsService.loadContacts();
    }

    // Try to find contact
    let results = contactsService.findByRelationship(contactName);
    if (results.length === 0) {
      results = contactsService.searchContacts(contactName);
    }

    if (results.length === 0) {
      return {
        success: false,
        message: `I couldn't find "${contactName}" in your contacts.`,
      };
    }

    const contact = results[0].contact;
    const phoneNumber = contact.phoneNumbers[0];

    const request: ActionRequest = {
      type: 'whatsapp',
      params: {
        phone: phoneNumber,
        message: messageContent,
        contactName: contact.name,
      },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    const confirmation: ActionConfirmation = {
      type: 'whatsapp',
      title: `WhatsApp ${contact.name}?`,
      description: messageContent
        ? `Send: "${messageContent}"`
        : 'This will open WhatsApp',
      icon: '📱',
      details: [
        { label: 'Contact', value: contact.name, icon: '👤' },
        { label: 'Number', value: phoneNumber, icon: '📞' },
      ],
      actions: [
        { id: 'confirm', label: 'Open WhatsApp', type: 'confirm', style: 'primary' },
        { id: 'cancel', label: 'Cancel', type: 'cancel', style: 'secondary' },
      ],
    };

    return {
      success: true,
      message: `Opening WhatsApp for ${contact.name}`,
      requiresConfirmation: true,
      actionConfirmation: confirmation,
    };
  }

  // ========================================
  // Phase 13: New Action Executors
  // ========================================

  /**
   * Execute a ride request action
   */
  async executeRideAction(
    provider: 'uber' | 'ola' | 'lyft',
    destination: string,
    pickup?: string
  ): Promise<ActionResult> {
    const actionType = provider === 'ola' ? 'ola_ride'
      : provider === 'lyft' ? 'lyft_ride'
      : 'uber_ride';

    const request: ActionRequest = {
      type: actionType,
      params: {
        destination: { address: destination },
        pickup: pickup ? { address: pickup } : undefined,
      },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    return appLauncherService.executeAction(request);
  }

  /**
   * Execute a navigation action
   */
  async executeNavigationAction(destination: string): Promise<ActionResult> {
    const request: ActionRequest = {
      type: 'maps_navigate',
      params: { destination: { address: destination } },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    return appLauncherService.executeAction(request);
  }

  /**
   * Execute YouTube action
   */
  async executeYouTubeAction(query?: string): Promise<ActionResult> {
    const request: ActionRequest = {
      type: query ? 'youtube_search' : 'youtube_play',
      params: { query: query || '' },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    return appLauncherService.executeAction(request);
  }

  /**
   * Execute music action
   */
  async executeMusicAction(query?: string, artist?: string): Promise<ActionResult> {
    const request: ActionRequest = {
      type: 'spotify_play',
      params: { query: query || '', artist },
      source: 'voice',
      timestamp: new Date().toISOString(),
    };

    return appLauncherService.executeAction(request);
  }

  /**
   * Execute OTP read action
   */
  async executeOTPAction(speakFunction: (text: string) => Promise<void>): Promise<ActionResult> {
    const result = await otpAssistantService.readOTPAloud(speakFunction);

    return {
      success: result.success,
      message: result.message,
      action: 'otp_assist',
    };
  }

  /**
   * Get pending reminders
   */
  getPendingReminders(): PendingReminder[] {
    return this.pendingReminders.filter((r) => r.time.getTime() > Date.now());
  }

  /**
   * Cancel a reminder
   */
  cancelReminder(id: string): boolean {
    const index = this.pendingReminders.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.pendingReminders.splice(index, 1);
      return true;
    }
    return false;
  }
}

export const intentActionsService = new IntentActionsService();
export default intentActionsService;
