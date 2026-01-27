import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { getTranslations, Translations } from './translations';

interface UseTranslationReturn {
  t: Translations;
  language: string;
}

export function useTranslation(): UseTranslationReturn {
  const { settings } = useSettings();

  const t = useMemo(() => {
    return getTranslations(settings.language);
  }, [settings.language]);

  return {
    t,
    language: settings.language,
  };
}

export default useTranslation;
