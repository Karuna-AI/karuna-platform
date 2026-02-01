/**
 * Incoming Deep Links Service
 * Parses karuna:// URLs and maps them to internal screens
 */

export type DeepLinkScreen =
  | 'chat'
  | 'vault'
  | 'settings'
  | 'care_circle'
  | 'health_dashboard'
  | 'vault_medications'
  | 'vault_doctors'
  | 'vault_appointments'
  | 'vault_contacts'
  | 'vault_accounts'
  | 'vault_documents'
  | 'security'
  | 'proactive_settings';

interface ParsedDeepLink {
  screen: DeepLinkScreen;
  params?: Record<string, string>;
}

const SCREEN_MAP: Record<string, DeepLinkScreen> = {
  chat: 'chat',
  vault: 'vault',
  settings: 'settings',
  circle: 'care_circle',
  'care-circle': 'care_circle',
  health: 'health_dashboard',
  medications: 'vault_medications',
  doctors: 'vault_doctors',
  appointments: 'vault_appointments',
  contacts: 'vault_contacts',
  accounts: 'vault_accounts',
  documents: 'vault_documents',
  security: 'security',
  'check-ins': 'proactive_settings',
};

/**
 * Parse a karuna:// URL into a screen and params
 */
export function parseKarunaUrl(url: string): ParsedDeepLink | null {
  if (!url) return null;

  try {
    // Handle both karuna://screen and karuna://screen?key=value
    let path: string;
    let search = '';

    if (url.startsWith('karuna://')) {
      const withoutScheme = url.slice('karuna://'.length);
      const questionIndex = withoutScheme.indexOf('?');
      if (questionIndex !== -1) {
        path = withoutScheme.slice(0, questionIndex);
        search = withoutScheme.slice(questionIndex + 1);
      } else {
        path = withoutScheme;
      }
    } else {
      // Try URL constructor for https:// links
      const parsed = new URL(url);
      path = parsed.pathname.replace(/^\//, '');
      search = parsed.search.replace(/^\?/, '');
    }

    // Normalize path
    path = path.replace(/\/$/, '').toLowerCase();

    const screen = SCREEN_MAP[path];
    if (!screen) {
      console.debug(`[DeepLinks] Unknown path: ${path}`);
      return null;
    }

    // Parse query params
    const params: Record<string, string> = {};
    if (search) {
      const searchParams = new URLSearchParams(search);
      searchParams.forEach((value, key) => {
        params[key] = value;
      });
    }

    return { screen, params: Object.keys(params).length > 0 ? params : undefined };
  } catch (error) {
    console.error('[DeepLinks] Failed to parse URL:', url, error);
    return null;
  }
}
