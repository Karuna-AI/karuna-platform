/**
 * Deep Links Catalog
 * Comprehensive catalog of app deep links for various services
 */

import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import {
  DeepLinkDefinition,
  ActionType,
  ActionLocation,
  ActionCategory,
} from '../types/actions';

// App Catalog
const APP_CATALOG: DeepLinkDefinition[] = [
  // Ride-Hailing Apps
  {
    appId: 'uber',
    appName: 'Uber',
    packageName: {
      android: 'com.ubercab',
      ios: 'com.ubercab.UberClient',
    },
    schemes: ['uber://', 'uberx://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.ubercab',
      ios: 'https://apps.apple.com/app/uber/id368677368',
    },
    category: 'transportation',
    icon: '🚗',
    actions: [
      {
        type: 'uber_ride',
        template: {
          android: 'uber://?action=setPickup&pickup=my_location&dropoff[formatted_address]={{destination}}&dropoff[latitude]={{lat}}&dropoff[longitude]={{lng}}',
          ios: 'uber://?action=setPickup&pickup=my_location&dropoff[formatted_address]={{destination}}&dropoff[latitude]={{lat}}&dropoff[longitude]={{lng}}',
          web: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]={{destination}}',
        },
        params: [
          { name: 'destination', type: 'string', required: true, encode: true },
          { name: 'lat', type: 'number', required: false },
          { name: 'lng', type: 'number', required: false },
        ],
        description: 'Request an Uber ride to a destination',
      },
    ],
  },
  {
    appId: 'ola',
    appName: 'Ola',
    packageName: {
      android: 'com.olacabs.customer',
      ios: 'com.olacabs.app',
    },
    schemes: ['olacabs://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.olacabs.customer',
      ios: 'https://apps.apple.com/app/ola-cabs/id539179365',
    },
    category: 'transportation',
    icon: '🚕',
    actions: [
      {
        type: 'ola_ride',
        template: {
          android: 'olacabs://app/launch?drop_lat={{lat}}&drop_lng={{lng}}&drop_name={{destination}}',
          ios: 'olacabs://app/launch?drop_lat={{lat}}&drop_lng={{lng}}&drop_name={{destination}}',
          web: 'https://book.olacabs.com/?drop_lat={{lat}}&drop_lng={{lng}}',
        },
        params: [
          { name: 'destination', type: 'string', required: true, encode: true },
          { name: 'lat', type: 'number', required: false },
          { name: 'lng', type: 'number', required: false },
        ],
        description: 'Request an Ola ride to a destination',
      },
    ],
  },
  {
    appId: 'lyft',
    appName: 'Lyft',
    packageName: {
      android: 'me.lyft.android',
      ios: 'com.zimride.LyftApp',
    },
    schemes: ['lyft://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=me.lyft.android',
      ios: 'https://apps.apple.com/app/lyft/id529379082',
    },
    category: 'transportation',
    icon: '🚙',
    actions: [
      {
        type: 'lyft_ride',
        template: {
          android: 'lyft://ridetype?id=lyft&destination[address]={{destination}}&destination[latitude]={{lat}}&destination[longitude]={{lng}}',
          ios: 'lyft://ridetype?id=lyft&destination[address]={{destination}}&destination[latitude]={{lat}}&destination[longitude]={{lng}}',
          web: 'https://www.lyft.com/',
        },
        params: [
          { name: 'destination', type: 'string', required: true, encode: true },
          { name: 'lat', type: 'number', required: false },
          { name: 'lng', type: 'number', required: false },
        ],
        description: 'Request a Lyft ride to a destination',
      },
    ],
  },

  // Maps & Navigation
  {
    appId: 'google_maps',
    appName: 'Google Maps',
    packageName: {
      android: 'com.google.android.apps.maps',
      ios: 'com.google.Maps',
    },
    schemes: ['comgooglemaps://', 'google.maps://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.maps',
      ios: 'https://apps.apple.com/app/google-maps/id585027354',
    },
    category: 'navigation',
    icon: '🗺️',
    actions: [
      {
        type: 'maps_navigate',
        template: {
          android: 'google.navigation:q={{destination}}&mode={{mode}}',
          ios: 'comgooglemaps://?daddr={{destination}}&directionsmode={{mode}}',
          web: 'https://www.google.com/maps/dir/?api=1&destination={{destination}}&travelmode={{mode}}',
        },
        params: [
          { name: 'destination', type: 'string', required: true, encode: true },
          { name: 'mode', type: 'string', required: false },
        ],
        description: 'Navigate to a destination',
      },
      {
        type: 'maps_search',
        template: {
          android: 'geo:0,0?q={{query}}',
          ios: 'comgooglemaps://?q={{query}}',
          web: 'https://www.google.com/maps/search/?api=1&query={{query}}',
        },
        params: [{ name: 'query', type: 'string', required: true, encode: true }],
        description: 'Search for a location',
      },
      {
        type: 'maps_nearby',
        template: {
          android: 'geo:0,0?q={{type}}+near+me',
          ios: 'comgooglemaps://?q={{type}}+near+me',
          web: 'https://www.google.com/maps/search/{{type}}+near+me',
        },
        params: [{ name: 'type', type: 'string', required: true, encode: true }],
        description: 'Find nearby places',
      },
    ],
  },
  {
    appId: 'apple_maps',
    appName: 'Apple Maps',
    packageName: {
      android: '',
      ios: 'com.apple.Maps',
    },
    schemes: ['maps://'],
    storeUrl: {
      android: '',
      ios: '',
    },
    category: 'navigation',
    icon: '🗺️',
    actions: [
      {
        type: 'maps_navigate',
        template: {
          android: '',
          ios: 'maps://?daddr={{destination}}&dirflg={{mode}}',
          web: 'https://maps.apple.com/?daddr={{destination}}',
        },
        params: [
          { name: 'destination', type: 'string', required: true, encode: true },
          { name: 'mode', type: 'string', required: false },
        ],
        description: 'Navigate using Apple Maps',
      },
    ],
  },

  // Entertainment
  {
    appId: 'youtube',
    appName: 'YouTube',
    packageName: {
      android: 'com.google.android.youtube',
      ios: 'com.google.ios.youtube',
    },
    schemes: ['youtube://', 'vnd.youtube://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.google.android.youtube',
      ios: 'https://apps.apple.com/app/youtube/id544007664',
    },
    category: 'entertainment',
    icon: '▶️',
    actions: [
      {
        type: 'youtube_search',
        template: {
          android: 'vnd.youtube://results?search_query={{query}}',
          ios: 'youtube://results?search_query={{query}}',
          web: 'https://www.youtube.com/results?search_query={{query}}',
        },
        params: [{ name: 'query', type: 'string', required: true, encode: true }],
        description: 'Search YouTube',
      },
      {
        type: 'youtube_play',
        template: {
          android: 'vnd.youtube://watch?v={{videoId}}',
          ios: 'youtube://watch?v={{videoId}}',
          web: 'https://www.youtube.com/watch?v={{videoId}}',
        },
        params: [{ name: 'videoId', type: 'string', required: true }],
        description: 'Play a YouTube video',
      },
    ],
  },
  {
    appId: 'spotify',
    appName: 'Spotify',
    packageName: {
      android: 'com.spotify.music',
      ios: 'com.spotify.client',
    },
    schemes: ['spotify://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.spotify.music',
      ios: 'https://apps.apple.com/app/spotify-music-and-podcasts/id324684580',
    },
    category: 'entertainment',
    icon: '🎵',
    actions: [
      {
        type: 'spotify_play',
        template: {
          android: 'spotify://search/{{query}}',
          ios: 'spotify://search/{{query}}',
          web: 'https://open.spotify.com/search/{{query}}',
        },
        params: [{ name: 'query', type: 'string', required: true, encode: true }],
        description: 'Search and play on Spotify',
      },
    ],
  },

  // Communication
  {
    appId: 'whatsapp',
    appName: 'WhatsApp',
    packageName: {
      android: 'com.whatsapp',
      ios: 'net.whatsapp.WhatsApp',
    },
    schemes: ['whatsapp://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.whatsapp',
      ios: 'https://apps.apple.com/app/whatsapp-messenger/id310633997',
    },
    category: 'communication',
    icon: '📱',
    actions: [
      {
        type: 'whatsapp',
        template: {
          android: 'whatsapp://send?phone={{phone}}&text={{text}}',
          ios: 'whatsapp://send?phone={{phone}}&text={{text}}',
          web: 'https://wa.me/{{phone}}?text={{text}}',
        },
        params: [
          { name: 'phone', type: 'phone', required: true },
          { name: 'text', type: 'string', required: false, encode: true },
        ],
        description: 'Send a WhatsApp message',
      },
    ],
  },
  {
    appId: 'telegram',
    appName: 'Telegram',
    packageName: {
      android: 'org.telegram.messenger',
      ios: 'ph.telegra.Telegraph',
    },
    schemes: ['tg://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=org.telegram.messenger',
      ios: 'https://apps.apple.com/app/telegram-messenger/id686449807',
    },
    category: 'communication',
    icon: '✈️',
    actions: [],
  },

  // Shopping
  {
    appId: 'amazon',
    appName: 'Amazon',
    packageName: {
      android: 'com.amazon.mShop.android.shopping',
      ios: 'com.amazon.Amazon',
    },
    schemes: ['amzn://'],
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.amazon.mShop.android.shopping',
      ios: 'https://apps.apple.com/app/amazon-shopping/id297606951',
    },
    category: 'shopping',
    icon: '📦',
    actions: [
      {
        type: 'amazon_search',
        template: {
          android: 'amzn://apps/android?s={{query}}',
          ios: 'amzn://apps/amazon?s={{query}}',
          web: 'https://www.amazon.com/s?k={{query}}',
        },
        params: [{ name: 'query', type: 'string', required: true, encode: true }],
        description: 'Search Amazon',
      },
    ],
  },

  // Health
  {
    appId: 'emergency',
    appName: 'Emergency',
    packageName: {
      android: 'com.android.dialer',
      ios: 'com.apple.mobilephone',
    },
    schemes: ['tel://'],
    storeUrl: { android: '', ios: '' },
    category: 'health',
    icon: '🚨',
    actions: [
      {
        type: 'emergency_call',
        template: {
          android: 'tel:{{number}}',
          ios: 'tel:{{number}}',
          web: 'tel:{{number}}',
        },
        params: [{ name: 'number', type: 'phone', required: true }],
        description: 'Call emergency services',
      },
    ],
  },
];

class DeepLinksService {
  private catalog: Map<string, DeepLinkDefinition> = new Map();
  private actionIndex: Map<ActionType, DeepLinkDefinition[]> = new Map();

  constructor() {
    this.initializeCatalog();
  }

  private initializeCatalog(): void {
    for (const app of APP_CATALOG) {
      this.catalog.set(app.appId, app);

      for (const action of app.actions) {
        const existing = this.actionIndex.get(action.type) || [];
        existing.push(app);
        this.actionIndex.set(action.type, existing);
      }
    }
  }

  /**
   * Get all apps in the catalog
   */
  getAllApps(): DeepLinkDefinition[] {
    return Array.from(this.catalog.values());
  }

  /**
   * Get apps by category
   */
  getAppsByCategory(category: ActionCategory): DeepLinkDefinition[] {
    return this.getAllApps().filter((app) => app.category === category);
  }

  /**
   * Get app by ID
   */
  getApp(appId: string): DeepLinkDefinition | undefined {
    return this.catalog.get(appId);
  }

  /**
   * Get apps that support an action type
   */
  getAppsForAction(actionType: ActionType): DeepLinkDefinition[] {
    return this.actionIndex.get(actionType) || [];
  }

  /**
   * Build a deep link URL
   */
  buildDeepLink(
    appId: string,
    actionType: ActionType,
    params: Record<string, unknown>
  ): string | null {
    const app = this.catalog.get(appId);
    if (!app) return null;

    const action = app.actions.find((a) => a.type === actionType);
    if (!action) return null;

    const platform = Platform.OS as 'android' | 'ios';
    let template = action.template[platform] || action.template.web;

    if (!template) return null;

    // Replace parameters in template
    for (const param of action.params) {
      const value = params[param.name];
      if (value !== undefined) {
        const stringValue = String(value);
        const encodedValue = param.encode ? encodeURIComponent(stringValue) : stringValue;
        template = template.replace(`{{${param.name}}}`, encodedValue);
      } else if (param.required) {
        return null; // Missing required parameter
      } else {
        template = template.replace(`{{${param.name}}}`, '');
      }
    }

    return template;
  }

  /**
   * Get web fallback URL
   */
  getWebFallback(
    appId: string,
    actionType: ActionType,
    params: Record<string, unknown>
  ): string | null {
    const app = this.catalog.get(appId);
    if (!app) return null;

    const action = app.actions.find((a) => a.type === actionType);
    if (!action || !action.template.web) return null;

    let template = action.template.web;

    for (const param of action.params) {
      const value = params[param.name];
      if (value !== undefined) {
        const stringValue = String(value);
        const encodedValue = param.encode ? encodeURIComponent(stringValue) : stringValue;
        template = template.replace(`{{${param.name}}}`, encodedValue);
      }
    }

    return template;
  }

  /**
   * Check if an app is installed
   */
  async isAppInstalled(appId: string): Promise<boolean> {
    const app = this.catalog.get(appId);
    if (!app) return false;

    for (const scheme of app.schemes) {
      try {
        const canOpen = await Linking.canOpenURL(scheme);
        if (canOpen) return true;
      } catch {
        // Continue checking other schemes
      }
    }

    return false;
  }

  /**
   * Get store URL for an app
   */
  getStoreUrl(appId: string): string | null {
    const app = this.catalog.get(appId);
    if (!app) return null;

    const platform = Platform.OS as 'android' | 'ios';
    return app.storeUrl[platform] || null;
  }

  /**
   * Open a deep link
   */
  async openDeepLink(url: string): Promise<boolean> {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[DeepLinks] Error opening URL:', error);
      return false;
    }
  }

  /**
   * Open an app's store page
   */
  async openStore(appId: string): Promise<boolean> {
    const storeUrl = this.getStoreUrl(appId);
    if (!storeUrl) return false;

    return this.openDeepLink(storeUrl);
  }

  /**
   * Get preferred app for an action
   * Returns the first installed app, or first in list if none installed
   */
  async getPreferredApp(actionType: ActionType): Promise<DeepLinkDefinition | null> {
    const apps = this.getAppsForAction(actionType);
    if (apps.length === 0) return null;

    for (const app of apps) {
      if (await this.isAppInstalled(app.appId)) {
        return app;
      }
    }

    return apps[0];
  }
}

export const deepLinksService = new DeepLinksService();
export default deepLinksService;
