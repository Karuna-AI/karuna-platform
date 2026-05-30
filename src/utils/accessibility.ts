import { AccessibilityInfo } from 'react-native';
import { AccessibilityConfig, ACCESSIBILITY_DEFAULTS } from '../types';

export const FONT_SIZES = {
  normal: {
    body: 16,
    bodySmall: 14,
    bodyLarge: 18,
    header: 20,
    headerLarge: 24,
    button: 18,
  },
  large: {
    body: 18,
    bodySmall: 16,
    bodyLarge: 20,
    header: 24,
    headerLarge: 28,
    button: 20,
  },
  extraLarge: {
    body: 22,
    bodySmall: 18,
    bodyLarge: 24,
    header: 28,
    headerLarge: 32,
    button: 24,
  },
};

export const COLORS = {
  standard: {
    primary: '#2196F3',
    primaryDark: '#1976D2',
    background: '#FFFFFF',
    surface: '#F5F5F5',
    text: '#212121',
    textSecondary: '#757575',
    userBubble: '#E3F2FD',
    assistantBubble: '#F5F5F5',
    error: '#D32F2F',
    success: '#388E3C',
    warning: '#F57C00',
    border: '#E5E7EB',
  },
  highContrast: {
    primary: '#1565C0',
    primaryDark: '#0D47A1',
    background: '#FFFFFF',
    surface: '#EEEEEE',
    text: '#000000',
    textSecondary: '#424242',
    userBubble: '#BBDEFB',
    assistantBubble: '#E0E0E0',
    error: '#B71C1C',
    success: '#1B5E20',
    warning: '#E65100',
    border: '#BDBDBD',
  },
  // Dark-mode palettes. Backgrounds are deep gray (not pure black) for less
  // eye strain on OLED phones at night; primary and accent hues are shifted
  // brighter to maintain ≥4.5:1 contrast on dark backgrounds.
  darkStandard: {
    primary: '#64B5F6',
    primaryDark: '#42A5F5',
    background: '#121212',
    surface: '#1E1E1E',
    text: '#FAFAFA',
    textSecondary: '#B0B0B0',
    userBubble: '#1565C0',
    assistantBubble: '#262626',
    error: '#EF5350',
    success: '#66BB6A',
    warning: '#FFB74D',
    border: '#2C2C2C',
  },
  darkHighContrast: {
    primary: '#90CAF9',
    primaryDark: '#64B5F6',
    background: '#000000',
    surface: '#121212',
    text: '#FFFFFF',
    textSecondary: '#E0E0E0',
    userBubble: '#1976D2',
    assistantBubble: '#1E1E1E',
    error: '#FF8A80',
    success: '#A5D6A7',
    warning: '#FFCC80',
    border: '#424242',
  },
};

export type ColorScheme = 'light' | 'dark';

export function getColors(highContrast: boolean = true, colorScheme: ColorScheme = 'light') {
  if (colorScheme === 'dark') {
    return highContrast ? COLORS.darkHighContrast : COLORS.darkStandard;
  }
  return highContrast ? COLORS.highContrast : COLORS.standard;
}

export function getFontSizes(size: AccessibilityConfig['fontSize'] = 'large') {
  return FONT_SIZES[size];
}

export const TOUCH_TARGETS = {
  minimum: 48,
  comfortable: 56,
  large: 72,
  voiceButton: 100,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export async function isScreenReaderEnabled(): Promise<boolean> {
  return AccessibilityInfo.isScreenReaderEnabled();
}

export function announceForAccessibility(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

export function createAccessibilityLabel(
  action: string,
  state?: string
): string {
  return state ? `${action}. ${state}` : action;
}

export function formatDurationForAccessibility(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes} minute${minutes !== 1 ? 's' : ''} and ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

export function getAccessibilityRole(
  componentType: 'button' | 'text' | 'header' | 'link' | 'image'
) {
  const roleMap: Record<string, string> = {
    button: 'button',
    text: 'text',
    header: 'header',
    link: 'link',
    image: 'image',
  };
  return roleMap[componentType];
}

export function getAccessibilityHint(action: string): string {
  const hints: Record<string, string> = {
    record: 'Double tap and hold to start recording, release to stop',
    send: 'Double tap to send your message',
    clear: 'Double tap to clear the conversation',
    retry: 'Double tap to try again',
    stop: 'Double tap to stop speaking',
  };
  return hints[action] || `Double tap to ${action}`;
}

export const accessibilityDefaults: AccessibilityConfig = ACCESSIBILITY_DEFAULTS;
