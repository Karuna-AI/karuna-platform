import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getColors, ColorScheme } from '../utils/accessibility';
import { useSettings } from './SettingsContext';

// Theme is derived from two inputs:
//   - the system color scheme (Android Settings → Display → Dark theme), and
//   - the user's accessibility `highContrast` preference (SettingsContext).
// Components consume it via `useTheme()` instead of calling `getColors()`
// directly so they re-render when the system scheme flips.

type Palette = ReturnType<typeof getColors>;

interface ThemeContextValue {
  colors: Palette;
  isDark: boolean;
  colorScheme: ColorScheme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const { settings } = useSettings();

  const value = useMemo<ThemeContextValue>(() => {
    const colorScheme: ColorScheme = systemScheme === 'dark' ? 'dark' : 'light';
    const colors = getColors(settings.highContrast, colorScheme);
    return { colors, isDark: colorScheme === 'dark', colorScheme };
  }, [systemScheme, settings.highContrast]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
