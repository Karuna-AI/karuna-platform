/**
 * Web mock for expo-localization
 * Uses browser APIs for locale information
 */

// Get the browser's locale
const browserLocale = navigator.language || 'en-US';
const browserLocales = navigator.languages || [browserLocale];

// Parse locale into parts
const [languageCode, regionCode] = browserLocale.split('-');

// Detect RTL languages
const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd'];
const isRTL = rtlLanguages.includes(languageCode.toLowerCase());

// Get timezone
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Exports
export const locale = browserLocale;
export const locales = browserLocales;
export { timezone };
export { isRTL };
export const region = regionCode || 'US';

// ISO currency codes
export const isoCurrencyCodes = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'AUD', 'CAD'];

export interface Locale {
  languageTag: string;
  languageCode: string;
  regionCode: string | null;
  textDirection: 'ltr' | 'rtl';
  digitGroupingSeparator: string;
  decimalSeparator: string;
  measurementSystem: 'metric' | 'us' | 'uk';
  currencyCode: string | null;
  currencySymbol: string | null;
  temperatureUnit: 'celsius' | 'fahrenheit';
}

export interface Calendar {
  calendar: string;
  timeZone: string;
  uses24hourClock: boolean;
  firstWeekday: number;
}

export function getLocales(): Locale[] {
  // Try to get number formatting info
  let digitGroupingSeparator = ',';
  let decimalSeparator = '.';

  try {
    const parts = new Intl.NumberFormat(browserLocale).formatToParts(1234.5);
    for (const part of parts) {
      if (part.type === 'group') digitGroupingSeparator = part.value;
      if (part.type === 'decimal') decimalSeparator = part.value;
    }
  } catch {}

  return [{
    languageTag: browserLocale,
    languageCode: languageCode.toLowerCase(),
    regionCode: regionCode?.toUpperCase() || null,
    textDirection: isRTL ? 'rtl' : 'ltr',
    digitGroupingSeparator,
    decimalSeparator,
    measurementSystem: ['US', 'LR', 'MM'].includes(regionCode || '') ? 'us' : 'metric',
    currencyCode: getCurrencyForRegion(regionCode),
    currencySymbol: getCurrencySymbol(regionCode),
    temperatureUnit: ['US', 'BS', 'KY', 'LR', 'PW', 'FM', 'MH'].includes(regionCode || '') ? 'fahrenheit' : 'celsius',
  }];
}

export function getCalendars(): Calendar[] {
  // Try to detect 24-hour format preference
  let uses24hourClock = false;
  try {
    const timeString = new Date(2020, 0, 1, 13, 0).toLocaleTimeString(browserLocale);
    uses24hourClock = !timeString.includes('PM') && !timeString.includes('AM');
  } catch {}

  return [{
    calendar: 'gregorian',
    timeZone: timezone,
    uses24hourClock,
    firstWeekday: getFirstWeekday(regionCode),
  }];
}

// Helper functions
function getCurrencyForRegion(region?: string): string | null {
  const currencyMap: Record<string, string> = {
    US: 'USD', GB: 'GBP', EU: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR',
    JP: 'JPY', CN: 'CNY', IN: 'INR', AU: 'AUD', CA: 'CAD', BR: 'BRL', MX: 'MXN',
    RU: 'RUB', KR: 'KRW', CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
  };
  return region ? currencyMap[region] || null : null;
}

function getCurrencySymbol(region?: string): string | null {
  const symbolMap: Record<string, string> = {
    US: '$', GB: '£', EU: '€', DE: '€', FR: '€', JP: '¥', CN: '¥',
    IN: '₹', AU: 'A$', CA: 'C$', BR: 'R$', MX: '$', RU: '₽', KR: '₩',
    CH: 'CHF', SE: 'kr', NO: 'kr', DK: 'kr', PL: 'zł',
  };
  return region ? symbolMap[region] || null : null;
}

function getFirstWeekday(region?: string): number {
  // Sunday = 1, Monday = 2, etc.
  const mondayFirst = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'CH', 'AT', 'PL', 'CZ', 'HU', 'RO', 'RU', 'UA', 'SE', 'NO', 'DK', 'FI', 'IN', 'AU', 'NZ'];
  const saturdayFirst = ['AE', 'AF', 'BH', 'DJ', 'DZ', 'EG', 'IQ', 'IR', 'JO', 'KW', 'LY', 'OM', 'QA', 'SA', 'SD', 'SY'];

  if (region) {
    if (mondayFirst.includes(region)) return 2;
    if (saturdayFirst.includes(region)) return 7;
  }
  return 1; // Sunday (US default)
}

export default {
  locale,
  locales,
  timezone,
  isRTL,
  region,
  isoCurrencyCodes,
  getLocales,
  getCalendars,
};
