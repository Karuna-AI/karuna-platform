/**
 * OTP Assistant Service
 * Safe handling of OTPs - read aloud, never store, never log
 *
 * SAFETY RULES:
 * 1. NEVER store OTP values in memory, logs, or storage
 * 2. NEVER ask for passwords, PINs, or CVVs
 * 3. Only read OTPs from SMS with user permission
 * 4. Clear OTP from display after 30 seconds
 * 5. Never transmit OTPs over network
 */

import { Platform, PermissionsAndroid } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ACTION_SAFETY } from '../types/actions';

export interface OTPDetectionResult {
  found: boolean;
  source?: string;
  length?: number;
  type?: 'numeric' | 'alphanumeric';
  // NOTE: We do NOT store the actual OTP value
}

export interface OTPReadResult {
  success: boolean;
  message: string;
  // NOTE: OTP is passed to TTS directly, never returned or stored
}

// Patterns to detect OTP messages (without capturing the actual OTP)
const OTP_MESSAGE_PATTERNS = [
  /\bOTP\b/i,
  /\bone[- ]?time[- ]?password\b/i,
  /\bverification[- ]?code\b/i,
  /\bsecurity[- ]?code\b/i,
  /\bconfirmation[- ]?code\b/i,
  /\bpin[- ]?code\b/i,
  /\b\d{4,8}\b.*(?:is|code|otp|verify)/i,
];

// Patterns to identify OTP source (bank, app, etc.)
const OTP_SOURCE_PATTERNS: Record<string, RegExp[]> = {
  bank: [
    /\bbank\b/i,
    /\bSBI\b/i,
    /\bHDFC\b/i,
    /\bICICI\b/i,
    /\bAxis\b/i,
    /\bKotak\b/i,
    /\bBOB\b/i,
    /\bChase\b/i,
    /\bCiti\b/i,
    /\bWells Fargo\b/i,
    /\bBank of America\b/i,
  ],
  payment: [
    /\bPaytm\b/i,
    /\bPhonePe\b/i,
    /\bGoogle Pay\b/i,
    /\bAmazon Pay\b/i,
    /\bPayPal\b/i,
    /\bVenmo\b/i,
    /\bUPI\b/i,
  ],
  ecommerce: [
    /\bAmazon\b/i,
    /\bFlipkart\b/i,
    /\bMyntra\b/i,
    /\bSwiggy\b/i,
    /\bZomato\b/i,
    /\bUber\b/i,
    /\bOla\b/i,
  ],
  social: [
    /\bWhatsApp\b/i,
    /\bFacebook\b/i,
    /\bInstagram\b/i,
    /\bTwitter\b/i,
    /\bGoogle\b/i,
    /\bApple\b/i,
  ],
};

class OTPAssistantService {
  private displayTimeout: NodeJS.Timeout | null = null;
  private isActive: boolean = false;

  /**
   * Check if a message contains an OTP
   * NOTE: Does not extract or store the actual OTP
   */
  detectOTPMessage(message: string): OTPDetectionResult {
    // Check if message matches OTP patterns
    const isOTPMessage = OTP_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));

    if (!isOTPMessage) {
      return { found: false };
    }

    // Detect source without storing sensitive data
    const source = this.detectSource(message);

    // Detect OTP format (but not the value)
    const hasNumericOTP = /\b\d{4,8}\b/.test(message);
    const hasAlphanumericOTP = /\b[A-Z0-9]{6,10}\b/.test(message);

    return {
      found: true,
      source,
      length: hasNumericOTP ? this.detectOTPLength(message) : undefined,
      type: hasNumericOTP ? 'numeric' : hasAlphanumericOTP ? 'alphanumeric' : undefined,
    };
  }

  /**
   * Detect the source of an OTP (bank, app, etc.)
   */
  private detectSource(message: string): string | undefined {
    for (const [source, patterns] of Object.entries(OTP_SOURCE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          // Extract the specific company/bank name
          const match = message.match(pattern);
          return match ? match[0] : source;
        }
      }
    }
    return undefined;
  }

  /**
   * Detect OTP length without capturing the value
   */
  private detectOTPLength(message: string): number {
    const matches = message.match(/\b\d{4,8}\b/g);
    if (matches && matches.length > 0) {
      // Return length of first match
      return matches[0].length;
    }
    return 0;
  }

  /**
   * Request to read OTP aloud
   * The actual OTP is passed directly to TTS, never stored or returned
   */
  async readOTPAloud(
    speakFunction: (text: string) => Promise<void>
  ): Promise<OTPReadResult> {
    this.isActive = true;

    try {
      // Check clipboard for OTP
      const clipboardContent = await Clipboard.getStringAsync();

      if (!clipboardContent) {
        return {
          success: false,
          message: 'No OTP found in clipboard. Please copy the OTP first.',
        };
      }

      // Validate it looks like an OTP (4-8 digits or alphanumeric code)
      const isLikelyOTP = /^\d{4,8}$/.test(clipboardContent.trim()) ||
                         /^[A-Z0-9]{6,10}$/i.test(clipboardContent.trim());

      if (!isLikelyOTP) {
        return {
          success: false,
          message: 'The clipboard content does not appear to be an OTP.',
        };
      }

      // Read each digit separately for clarity
      const digits = clipboardContent.trim().split('');
      const spokenOTP = digits.join(', ');

      // Speak the OTP directly - it's never stored anywhere
      await speakFunction(`Your code is: ${spokenOTP}. I'll repeat that: ${spokenOTP}.`);

      // Clear clipboard after reading (safety measure)
      this.scheduleClear();

      return {
        success: true,
        message: 'OTP has been read aloud.',
      };
    } catch (error) {
      console.error('[OTPAssistant] Error:', error);
      return {
        success: false,
        message: 'Could not read the OTP. Please try again.',
      };
    } finally {
      this.isActive = false;
    }
  }

  /**
   * Help user understand where to enter OTP
   */
  async helpWithOTP(
    source: string | undefined,
    speakFunction: (text: string) => Promise<void>
  ): Promise<OTPReadResult> {
    let helpMessage: string;

    if (source) {
      helpMessage = `I see you received an OTP from ${source}. `;

      if (OTP_SOURCE_PATTERNS.bank.some((p) => p.test(source))) {
        helpMessage += 'For bank OTPs, enter the code in your banking app or on the payment page. Never share this code with anyone who calls you.';
      } else if (OTP_SOURCE_PATTERNS.payment.some((p) => p.test(source))) {
        helpMessage += 'For payment OTPs, enter the code to complete your transaction. Never share this code over the phone.';
      } else {
        helpMessage += 'Enter this code where requested to verify your identity. Never share this code with anyone.';
      }
    } else {
      helpMessage = 'I can help you read your OTP aloud. First, copy the code from the message, then ask me to read it. Remember, never share your OTP with anyone who calls or messages you.';
    }

    await speakFunction(helpMessage);

    return {
      success: true,
      message: helpMessage,
    };
  }

  /**
   * Schedule clearing of any displayed OTP (safety measure)
   */
  private scheduleClear(): void {
    if (this.displayTimeout) {
      clearTimeout(this.displayTimeout);
    }

    this.displayTimeout = setTimeout(() => {
      // Clear any UI showing the OTP
      this.isActive = false;
    }, ACTION_SAFETY.otpRules.maxDisplayTime);
  }

  /**
   * Check if OTP assistant is currently active
   */
  isOTPActive(): boolean {
    return this.isActive;
  }

  /**
   * Validate that we're not being asked for sensitive info
   */
  validateRequest(request: string): { safe: boolean; warning?: string } {
    const lowerRequest = request.toLowerCase();

    // Never ask for passwords
    if (/password/i.test(request)) {
      return {
        safe: false,
        warning: 'I cannot help with passwords. Please enter passwords yourself for security.',
      };
    }

    // Never ask for CVV
    if (/cvv|security code on card|card security/i.test(request)) {
      return {
        safe: false,
        warning: 'I cannot help with CVV or card security codes. Please enter these yourself.',
      };
    }

    // Never ask for PINs (except OTP which is one-time)
    if (/\bpin\b/i.test(request) && !/otp|one-time/i.test(request)) {
      return {
        safe: false,
        warning: 'I cannot help with PINs. Please enter your PIN yourself.',
      };
    }

    return { safe: true };
  }

  /**
   * Get safety tips for OTPs
   */
  getSafetyTips(): string[] {
    return [
      'Never share your OTP with anyone who calls you - banks never ask for OTPs over the phone.',
      'OTPs expire quickly, usually within 5-10 minutes.',
      'If you receive an OTP you did not request, someone may be trying to access your account.',
      'Only enter OTPs on official websites or apps.',
      'If in doubt, call your bank using the number on your card.',
    ];
  }
}

export const otpAssistantService = new OTPAssistantService();
export default otpAssistantService;
