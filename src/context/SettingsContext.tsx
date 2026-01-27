import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { storageService } from '../services/storage';
import { LanguageCode, getLanguageConfig } from '../i18n/languages';
import { languageService } from '../services/languageService';
import { ttsService } from '../services/tts';

export type FontSize = 'small' | 'medium' | 'large' | 'extraLarge';
export type SpeechRate = 0.7 | 0.8 | 0.9 | 1.0;
// Keep Language type for backwards compatibility but use LanguageCode
export type Language = LanguageCode;

export interface EmergencyContact {
  id: string;
  name: string;
  phoneNumber: string;
  relationship?: string;
}

export interface AppSettings {
  // Display
  fontSize: FontSize;
  highContrast: boolean;

  // Voice
  speechRate: SpeechRate;
  voiceId?: string;
  ttsEnabled: boolean;
  autoPlayResponses: boolean;

  // Language
  language: Language;

  // Accessibility
  hapticFeedback: boolean;

  // Emergency
  emergencyContacts: EmergencyContact[];
  primaryEmergencyContact?: string; // ID of primary contact
}

const DEFAULT_SETTINGS: AppSettings = {
  fontSize: 'large',
  highContrast: true,
  speechRate: 0.8,
  ttsEnabled: true,
  autoPlayResponses: true,
  language: 'en',
  hapticFeedback: true,
  emergencyContacts: [],
};

interface SettingsContextValue {
  settings: AppSettings;
  isLoading: boolean;

  // Display settings
  setFontSize: (size: FontSize) => void;
  setHighContrast: (enabled: boolean) => void;

  // Voice settings
  setSpeechRate: (rate: SpeechRate) => void;
  setVoiceId: (id: string | undefined) => void;
  setTtsEnabled: (enabled: boolean) => void;
  setAutoPlayResponses: (enabled: boolean) => void;

  // Language
  setLanguage: (lang: Language) => void;
  getLanguageConfig: () => ReturnType<typeof getLanguageConfig>;
  isRTL: () => boolean;
  getEmergencyNumber: () => string;

  // Accessibility
  setHapticFeedback: (enabled: boolean) => void;

  // Emergency contacts
  addEmergencyContact: (contact: Omit<EmergencyContact, 'id'>) => void;
  removeEmergencyContact: (id: string) => void;
  updateEmergencyContact: (id: string, updates: Partial<EmergencyContact>) => void;
  setPrimaryEmergencyContact: (id: string | undefined) => void;
  getPrimaryEmergencyContact: () => EmergencyContact | undefined;

  // Reset
  resetToDefaults: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface SettingsProviderProps {
  children: ReactNode;
}

const SETTINGS_STORAGE_KEY = '@karuna/app_settings';

export function SettingsProvider({ children }: SettingsProviderProps): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount and initialize language services
  useEffect(() => {
    async function loadSettings() {
      try {
        // Initialize language service to detect device locale
        const deviceLanguage = await languageService.initialize();

        const saved = await storageService.loadSettings();
        if (saved) {
          // Merge with defaults to handle any new settings
          setSettings({ ...DEFAULT_SETTINGS, ...saved });

          // Sync language service with saved settings
          if (saved.language) {
            languageService.setLanguage(saved.language);
          }
        } else {
          // No saved settings - use device language as default
          setSettings({ ...DEFAULT_SETTINGS, language: deviceLanguage });
        }

        console.log(`[Settings] Loaded with language: ${saved?.language || deviceLanguage}`);
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Save settings whenever they change
  useEffect(() => {
    if (!isLoading) {
      storageService.saveSettings(settings);
    }
  }, [settings, isLoading]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // Display settings
  const setFontSize = useCallback((fontSize: FontSize) => {
    updateSettings({ fontSize });
  }, [updateSettings]);

  const setHighContrast = useCallback((highContrast: boolean) => {
    updateSettings({ highContrast });
  }, [updateSettings]);

  // Voice settings
  const setSpeechRate = useCallback((speechRate: SpeechRate) => {
    updateSettings({ speechRate });
  }, [updateSettings]);

  const setVoiceId = useCallback((voiceId: string | undefined) => {
    updateSettings({ voiceId });
  }, [updateSettings]);

  const setTtsEnabled = useCallback((ttsEnabled: boolean) => {
    updateSettings({ ttsEnabled });
  }, [updateSettings]);

  const setAutoPlayResponses = useCallback((autoPlayResponses: boolean) => {
    updateSettings({ autoPlayResponses });
  }, [updateSettings]);

  // Language - syncs with language services for STT/TTS
  const setLanguage = useCallback(async (language: Language) => {
    updateSettings({ language });

    // Sync with language services
    languageService.setLanguage(language);

    // Update TTS language and voice
    try {
      await ttsService.setLanguage(language);
    } catch (error) {
      console.error('[Settings] Error updating TTS language:', error);
    }

    console.log(`[Settings] Language changed to: ${language}`);
  }, [updateSettings]);

  // Language helpers
  const getCurrentLanguageConfig = useCallback(() => {
    return getLanguageConfig(settings.language);
  }, [settings.language]);

  const isRTL = useCallback(() => {
    return languageService.isRTL(settings.language);
  }, [settings.language]);

  const getEmergencyNumber = useCallback(() => {
    return languageService.getEmergencyNumber(settings.language);
  }, [settings.language]);

  // Accessibility
  const setHapticFeedback = useCallback((hapticFeedback: boolean) => {
    updateSettings({ hapticFeedback });
  }, [updateSettings]);

  // Emergency contacts
  const addEmergencyContact = useCallback((contact: Omit<EmergencyContact, 'id'>) => {
    const newContact: EmergencyContact = {
      ...contact,
      id: `emergency_${Date.now()}`,
    };
    setSettings((prev) => {
      const updated = {
        ...prev,
        emergencyContacts: [...prev.emergencyContacts, newContact],
      };
      // If this is the first contact, set it as primary
      if (prev.emergencyContacts.length === 0) {
        updated.primaryEmergencyContact = newContact.id;
      }
      return updated;
    });
  }, []);

  const removeEmergencyContact = useCallback((id: string) => {
    setSettings((prev) => {
      const emergencyContacts = prev.emergencyContacts.filter((c) => c.id !== id);
      const updates: Partial<AppSettings> = { emergencyContacts };

      // If we removed the primary, set first remaining as primary
      if (prev.primaryEmergencyContact === id) {
        updates.primaryEmergencyContact = emergencyContacts[0]?.id;
      }

      return { ...prev, ...updates };
    });
  }, []);

  const updateEmergencyContact = useCallback((id: string, updates: Partial<EmergencyContact>) => {
    setSettings((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  }, []);

  const setPrimaryEmergencyContact = useCallback((id: string | undefined) => {
    updateSettings({ primaryEmergencyContact: id });
  }, [updateSettings]);

  const getPrimaryEmergencyContact = useCallback((): EmergencyContact | undefined => {
    if (!settings.primaryEmergencyContact) {
      return settings.emergencyContacts[0];
    }
    return settings.emergencyContacts.find((c) => c.id === settings.primaryEmergencyContact);
  }, [settings.emergencyContacts, settings.primaryEmergencyContact]);

  // Reset
  const resetToDefaults = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, emergencyContacts: settings.emergencyContacts });
  }, [settings.emergencyContacts]);

  const value: SettingsContextValue = {
    settings,
    isLoading,
    setFontSize,
    setHighContrast,
    setSpeechRate,
    setVoiceId,
    setTtsEnabled,
    setAutoPlayResponses,
    setLanguage,
    getLanguageConfig: getCurrentLanguageConfig,
    isRTL,
    getEmergencyNumber,
    setHapticFeedback,
    addEmergencyContact,
    removeEmergencyContact,
    updateEmergencyContact,
    setPrimaryEmergencyContact,
    getPrimaryEmergencyContact,
    resetToDefaults,
  };

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export default SettingsContext;
