import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getColors, ColorScheme } from '../utils/accessibility';

// Theme is derived from the system color scheme (Android Settings → Display →
// Dark theme). Components consume it via `useTheme()` instead of calling
// `getColors()` directly so they re-render when the system scheme flips.
//
// NOTE: this context is intentionally decoupled from SettingsContext to keep
// the import graph shallow (importing SettingsContext from here caused
// jest.mock'd AsyncStorage chains to recurse in component tests). A future
// commit can pipe the user's `highContrast` preference in via a prop or a
// separate hook.

type Palette = ReturnType<typeof getColors>;

interface ThemeContextValue {
  colors: Palette;
  isDark: boolean;
  colorScheme: ColorScheme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  // Allow the host app to opt out of high-contrast (default true matches the
  // long-standing behavior of getColors(true) across the codebase).
  highContrast?: boolean;
}

export function ThemeProvider({ children, highContrast = true }: ThemeProviderProps) {
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const colorScheme: ColorScheme = systemScheme === 'dark' ? 'dark' : 'light';
    const colors = getColors(highContrast, colorScheme);
    return { colors, isDark: colorScheme === 'dark', colorScheme };
  }, [systemScheme, highContrast]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // Fallback for components rendered outside ThemeProvider (e.g. tests that
  // mount a single component directly). Falling back instead of throwing
  // keeps the runtime resilient — the worst case is a non-themed light
  // palette in an isolated render context.
  return {
    colors: getColors(true, 'light'),
    isDark: false,
    colorScheme: 'light',
  };
}
