/**
 * App Launcher Service
 * Handles launching apps and executing deep links
 */

import { Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';
import { deepLinksService } from './deepLinks';
import { auditLogService } from './auditLog';
import {
  ActionType,
  ActionRequest,
  ActionResult,
  ActionConfirmation,
  ActionLocation,
  ACTION_METADATA,
  ACTION_SAFETY,
} from '../types/actions';

/**
 * Known apps for the generic "open <app>" intent. Keys are normalized aliases;
 * each entry lists URL schemes to try first, the Android package (for an
 * explicit launcher intent), and a web fallback so the request still succeeds
 * when the native app is missing.
 */
interface KnownApp {
  label: string;
  schemes: string[];
  androidPackage?: string;
  web?: string;
}

const KNOWN_APPS: Record<string, KnownApp> = {
  whatsapp:  { label: 'WhatsApp',     schemes: ['whatsapp://send'],        androidPackage: 'com.whatsapp',                 web: 'https://web.whatsapp.com' },
  youtube:   { label: 'YouTube',      schemes: ['vnd.youtube://', 'youtube://'], androidPackage: 'com.google.android.youtube', web: 'https://www.youtube.com' },
  facebook:  { label: 'Facebook',     schemes: ['fb://feed'],              androidPackage: 'com.facebook.katana',          web: 'https://www.facebook.com' },
  instagram: { label: 'Instagram',    schemes: ['instagram://app'],        androidPackage: 'com.instagram.android',        web: 'https://www.instagram.com' },
  telegram:  { label: 'Telegram',     schemes: ['tg://resolve'],           androidPackage: 'org.telegram.messenger',       web: 'https://web.telegram.org' },
  spotify:   { label: 'Spotify',      schemes: ['spotify://'],             androidPackage: 'com.spotify.music',            web: 'https://open.spotify.com' },
  gmail:     { label: 'Gmail',        schemes: ['googlegmail://'],         androidPackage: 'com.google.android.gm',        web: 'https://mail.google.com' },
  maps:      { label: 'Maps',         schemes: ['geo:0,0'],                androidPackage: 'com.google.android.apps.maps', web: 'https://maps.google.com' },
  chrome:    { label: 'Chrome',       schemes: ['googlechrome://'],        androidPackage: 'com.android.chrome',           web: 'https://www.google.com' },
  netflix:   { label: 'Netflix',      schemes: ['nflx://'],                androidPackage: 'com.netflix.mediaclient',      web: 'https://www.netflix.com' },
  amazon:    { label: 'Amazon',       schemes: ['com.amazon.mobile.shopping://'], androidPackage: 'in.amazon.mShop.android.shopping', web: 'https://www.amazon.in' },
  flipkart:  { label: 'Flipkart',     schemes: ['flipkart://'],            androidPackage: 'com.flipkart.android',         web: 'https://www.flipkart.com' },
  paytm:     { label: 'Paytm',        schemes: ['paytmmp://'],             androidPackage: 'net.one97.paytm',              web: 'https://paytm.com' },
  phonepe:   { label: 'PhonePe',      schemes: ['phonepe://'],             androidPackage: 'com.phonepe.app',              web: 'https://www.phonepe.com' },
  'google pay': { label: 'Google Pay', schemes: ['tez://'],                androidPackage: 'com.google.android.apps.nbu.paisa.user', web: 'https://pay.google.com' },
  gpay:      { label: 'Google Pay',   schemes: ['tez://'],                 androidPackage: 'com.google.android.apps.nbu.paisa.user', web: 'https://pay.google.com' },
  uber:      { label: 'Uber',         schemes: ['uber://'],                androidPackage: 'com.ubercab',                  web: 'https://m.uber.com' },
  ola:       { label: 'Ola',          schemes: ['olacabs://'],             androidPackage: 'com.olacabs.customer',         web: 'https://book.olacabs.com' },
  hotstar:   { label: 'Hotstar',      schemes: ['hotstar://'],             androidPackage: 'in.startv.hotstar',            web: 'https://www.hotstar.com' },
  truecaller:{ label: 'Truecaller',   schemes: ['truecaller://'],          androidPackage: 'com.truecaller',               web: 'https://www.truecaller.com' },
  photos:    { label: 'Google Photos', schemes: ['googlephotos://'],       androidPackage: 'com.google.android.apps.photos', web: 'https://photos.google.com' },
  calendar:  { label: 'Calendar',     schemes: ['content://com.android.calendar/time/'], androidPackage: 'com.google.android.calendar', web: 'https://calendar.google.com' },
  phone:     { label: 'Phone',        schemes: ['tel:'] },
  messages:  { label: 'Messages',     schemes: ['sms:'] },
  settings:  { label: 'Settings',     schemes: ['app-settings:'] },
};

// Aliases that map common ways of saying an app's name onto registry keys.
const APP_ALIASES: Record<string, string> = {
  'whats app': 'whatsapp',
  'whatsup': 'whatsapp',
  'you tube': 'youtube',
  'insta': 'instagram',
  'fb': 'facebook',
  'google maps': 'maps',
  'map': 'maps',
  'mail': 'gmail',
  'email': 'gmail',
  'browser': 'chrome',
  'google chrome': 'chrome',
  'dialer': 'phone',
  'messaging': 'messages',
  'sms': 'messages',
  'text messages': 'messages',
  'google photos': 'photos',
  'gallery': 'photos',
  'disney hotstar': 'hotstar',
  'disney plus hotstar': 'hotstar',
};

class AppLauncherService {
  private lastAction: { type: ActionType; timestamp: number } | null = null;
  private actionCooldown = 2000; // 2 second cooldown between same actions
  private flashlightOn = false;

  /**
   * Execute an action
   */
  async executeAction(request: ActionRequest): Promise<ActionResult> {
    // Check cooldown to prevent double-taps
    if (this.lastAction &&
        this.lastAction.type === request.type &&
        Date.now() - this.lastAction.timestamp < this.actionCooldown) {
      return {
        success: false,
        message: 'Please wait a moment before trying again.',
      };
    }

    this.lastAction = { type: request.type, timestamp: Date.now() };

    // Validate request
    const validation = this.validateRequest(request);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || 'Invalid request',
      };
    }

    // Check if confirmation is required
    const metadata = ACTION_METADATA[request.type];
    if (metadata?.requiresConfirmation && !this.isConfirmed(request)) {
      return {
        success: false,
        requiresConfirmation: true,
        message: 'This action requires confirmation',
        confirmationData: this.buildConfirmation(request),
      };
    }

    // Execute based on action type
    try {
      const result = await this.dispatchAction(request);

      // Log the action
      await auditLogService.log({
        action: 'app_action_executed',
        category: 'system',
        description: `Action: ${request.type}`,
        metadata: {
          actionType: request.type,
          success: result.success,
          appOpened: result.appOpened,
        },
      });

      return result;
    } catch (error) {
      console.error('[AppLauncher] Error executing action:', error);
      return {
        success: false,
        message: 'Something went wrong. Please try again.',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate an action request
   */
  private validateRequest(request: ActionRequest): { valid: boolean; error?: string } {
    // Check for sensitive data patterns
    const paramsString = JSON.stringify(request.params);
    for (const pattern of ACTION_SAFETY.sensitivePatterns) {
      if (pattern.test(paramsString)) {
        return {
          valid: false,
          error: 'For your safety, I cannot process requests containing sensitive information like passwords or financial details.',
        };
      }
    }

    // Validate required parameters based on action type
    switch (request.type) {
      case 'uber_ride':
      case 'ola_ride':
      case 'lyft_ride':
        if (!request.params.destination) {
          return { valid: false, error: 'Destination is required for ride requests.' };
        }
        break;

      case 'maps_navigate':
        if (!request.params.destination) {
          return { valid: false, error: 'Destination is required for navigation.' };
        }
        break;

      case 'call':
      case 'message':
      case 'whatsapp':
        if (!request.params.phone && !request.params.contact) {
          return { valid: false, error: 'A contact or phone number is required.' };
        }
        break;

      case 'app_open':
        if (!request.params.appName || !String(request.params.appName).trim()) {
          return { valid: false, error: 'Which app would you like to open?' };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * Check if request has been confirmed (for sensitive actions)
   */
  private isConfirmed(request: ActionRequest): boolean {
    return (request.params as any).confirmed === true;
  }

  /**
   * Build confirmation data for an action
   */
  buildConfirmation(request: ActionRequest): ActionConfirmation {
    const metadata = ACTION_METADATA[request.type];

    const confirmation: ActionConfirmation = {
      type: request.type,
      title: `${metadata?.displayName || request.type}?`,
      description: this.getConfirmationDescription(request),
      icon: metadata?.icon || '?',
      details: this.getConfirmationDetails(request),
      actions: [
        { id: 'confirm', label: 'Yes, do it', type: 'confirm', style: 'primary' },
        { id: 'cancel', label: 'Cancel', type: 'cancel', style: 'secondary' },
      ],
    };

    // Add warnings for certain actions
    if (request.type === 'emergency_call') {
      confirmation.warnings = ['This will call emergency services (911/112)'];
    }

    return confirmation;
  }

  /**
   * Get confirmation description
   */
  private getConfirmationDescription(request: ActionRequest): string {
    switch (request.type) {
      case 'uber_ride':
        return `Request an Uber to ${(request.params.destination as ActionLocation)?.address || 'your destination'}?`;
      case 'ola_ride':
        return `Request an Ola to ${(request.params.destination as ActionLocation)?.address || 'your destination'}?`;
      case 'lyft_ride':
        return `Request a Lyft to ${(request.params.destination as ActionLocation)?.address || 'your destination'}?`;
      case 'maps_navigate':
        return `Navigate to ${(request.params.destination as ActionLocation)?.address || request.params.query || 'this location'}?`;
      case 'call':
        return `Call ${request.params.contact || request.params.phone}?`;
      case 'emergency_call':
        return 'Call emergency services?';
      case 'app_open':
        return `Open ${request.params.appName}?`;
      default:
        return `Proceed with ${ACTION_METADATA[request.type]?.displayName || request.type}?`;
    }
  }

  /**
   * Get confirmation details
   */
  private getConfirmationDetails(request: ActionRequest): ActionConfirmation['details'] {
    const details: ActionConfirmation['details'] = [];

    switch (request.type) {
      case 'uber_ride':
      case 'ola_ride':
      case 'lyft_ride': {
        const dest = request.params.destination as ActionLocation;
        if (dest?.address) {
          details.push({ label: 'To', value: dest.address, icon: '📍' });
        }
        if (request.params.rideType) {
          details.push({ label: 'Type', value: String(request.params.rideType), icon: '🚗' });
        }
        break;
      }

      case 'maps_navigate': {
        const navDest = request.params.destination as ActionLocation;
        if (navDest?.address) {
          details.push({ label: 'Destination', value: navDest.address, icon: '📍' });
        }
        if (request.params.mode) {
          details.push({ label: 'Mode', value: String(request.params.mode), icon: '🚶' });
        }
        break;
      }
    }

    return details.length > 0 ? details : undefined;
  }

  /**
   * Dispatch action to appropriate handler
   */
  private async dispatchAction(request: ActionRequest): Promise<ActionResult> {
    switch (request.type) {
      // Transportation
      case 'uber_ride':
        return this.openRideApp('uber', request);
      case 'ola_ride':
        return this.openRideApp('ola', request);
      case 'lyft_ride':
        return this.openRideApp('lyft', request);

      // Navigation
      case 'maps_navigate':
        return this.openNavigation(request);
      case 'maps_search':
        return this.openMapsSearch(request);
      case 'maps_nearby':
        return this.openNearbySearch(request);

      // Entertainment
      case 'youtube_search':
        return this.openYouTubeSearch(request);
      case 'spotify_play':
        return this.openSpotify(request);

      // Communication
      case 'call':
        return this.makePhoneCall(request);
      case 'whatsapp':
        return this.openWhatsApp(request);

      // Utility
      case 'camera_open':
        return this.openCamera();
      case 'flashlight':
        return this.toggleFlashlight();
      case 'app_open':
        return this.openApp(request);

      // Health
      case 'emergency_call':
        return this.makeEmergencyCall(request);
      case 'pharmacy_nearby':
        return this.findNearbyPlace('pharmacy', request);
      case 'hospital_nearby':
        return this.findNearbyPlace('hospital', request);

      // Shopping
      case 'amazon_search':
        return this.openAmazonSearch(request);

      default:
        return {
          success: false,
          message: `Action "${request.type}" is not yet supported.`,
        };
    }
  }

  /**
   * Open a ride-hailing app
   */
  private async openRideApp(
    appId: 'uber' | 'ola' | 'lyft',
    request: ActionRequest
  ): Promise<ActionResult> {
    const destination = request.params.destination as ActionLocation;

    // Get current location for pickup
    let _pickupLocation: ActionLocation | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        _pickupLocation = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
      }
    } catch {
      console.log('[AppLauncher] Could not get current location');
    }

    const params = {
      destination: destination.address || destination.name || '',
      lat: destination.latitude,
      lng: destination.longitude,
    };

    const actionType = `${appId}_ride` as ActionType;
    const deepLink = deepLinksService.buildDeepLink(appId, actionType, params);

    if (deepLink) {
      const opened = await deepLinksService.openDeepLink(deepLink);
      if (opened) {
        return {
          success: true,
          message: `Opening ${appId.charAt(0).toUpperCase() + appId.slice(1)}...`,
          action: actionType,
          appOpened: appId,
          deepLink,
        };
      }
    }

    // Try web fallback
    const webUrl = deepLinksService.getWebFallback(appId, actionType, params);
    if (webUrl) {
      await Linking.openURL(webUrl);
      return {
        success: true,
        message: `Opening ${appId.charAt(0).toUpperCase() + appId.slice(1)} in browser...`,
        action: actionType,
        deepLink: webUrl,
      };
    }

    // Offer to install the app
    const storeUrl = deepLinksService.getStoreUrl(appId);
    if (storeUrl) {
      return {
        success: false,
        message: `${appId.charAt(0).toUpperCase() + appId.slice(1)} app is not installed. Would you like to install it?`,
        action: actionType,
      };
    }

    return {
      success: false,
      message: `Could not open ${appId.charAt(0).toUpperCase() + appId.slice(1)}.`,
    };
  }

  /**
   * Open navigation to a destination
   */
  private async openNavigation(request: ActionRequest): Promise<ActionResult> {
    const destination = request.params.destination as ActionLocation;
    const mode = (request.params.mode as string) || 'driving';

    // Map mode to platform-specific values
    const modeMap: Record<string, { android: string; ios: string }> = {
      driving: { android: 'd', ios: 'driving' },
      walking: { android: 'w', ios: 'walking' },
      transit: { android: 'r', ios: 'transit' },
      cycling: { android: 'b', ios: 'walking' },
    };

    const platformMode = modeMap[mode] || modeMap.driving;
    const params = {
      destination: destination.address || destination.name || `${destination.latitude},${destination.longitude}`,
      mode: Platform.OS === 'ios' ? platformMode.ios : platformMode.android,
    };

    // Try Google Maps first
    const googleMapsLink = deepLinksService.buildDeepLink('google_maps', 'maps_navigate', params);
    if (googleMapsLink) {
      const opened = await deepLinksService.openDeepLink(googleMapsLink);
      if (opened) {
        return {
          success: true,
          message: 'Opening Google Maps...',
          action: 'maps_navigate',
          appOpened: 'google_maps',
        };
      }
    }

    // Try Apple Maps on iOS
    if (Platform.OS === 'ios') {
      const appleMapsLink = deepLinksService.buildDeepLink('apple_maps', 'maps_navigate', params);
      if (appleMapsLink) {
        const opened = await deepLinksService.openDeepLink(appleMapsLink);
        if (opened) {
          return {
            success: true,
            message: 'Opening Apple Maps...',
            action: 'maps_navigate',
            appOpened: 'apple_maps',
          };
        }
      }
    }

    // Web fallback
    const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(params.destination)}&travelmode=${mode}`;
    await Linking.openURL(webUrl);

    return {
      success: true,
      message: 'Opening maps in browser...',
      action: 'maps_navigate',
    };
  }

  /**
   * Open maps search
   */
  private async openMapsSearch(request: ActionRequest): Promise<ActionResult> {
    const query = request.params.query as string;

    const deepLink = deepLinksService.buildDeepLink('google_maps', 'maps_search', { query });
    if (deepLink) {
      const opened = await deepLinksService.openDeepLink(deepLink);
      if (opened) {
        return {
          success: true,
          message: 'Searching in maps...',
          action: 'maps_search',
          appOpened: 'google_maps',
        };
      }
    }

    // Web fallback
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    await Linking.openURL(webUrl);

    return {
      success: true,
      message: 'Opening maps search...',
      action: 'maps_search',
    };
  }

  /**
   * Open nearby search
   */
  private async openNearbySearch(request: ActionRequest): Promise<ActionResult> {
    const type = request.params.type as string || request.params.query as string;

    const deepLink = deepLinksService.buildDeepLink('google_maps', 'maps_nearby', { type });
    if (deepLink) {
      const opened = await deepLinksService.openDeepLink(deepLink);
      if (opened) {
        return {
          success: true,
          message: `Finding ${type} nearby...`,
          action: 'maps_nearby',
          appOpened: 'google_maps',
        };
      }
    }

    // Web fallback
    const webUrl = `https://www.google.com/maps/search/${encodeURIComponent(type)}+near+me`;
    await Linking.openURL(webUrl);

    return {
      success: true,
      message: `Searching for ${type} nearby...`,
      action: 'maps_nearby',
    };
  }

  /**
   * Open YouTube search
   */
  private async openYouTubeSearch(request: ActionRequest): Promise<ActionResult> {
    const query = request.params.query as string;

    const deepLink = deepLinksService.buildDeepLink('youtube', 'youtube_search', { query });
    if (deepLink) {
      const opened = await deepLinksService.openDeepLink(deepLink);
      if (opened) {
        return {
          success: true,
          message: 'Searching YouTube...',
          action: 'youtube_search',
          appOpened: 'youtube',
        };
      }
    }

    // Web fallback
    const webUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    await Linking.openURL(webUrl);

    return {
      success: true,
      message: 'Opening YouTube search...',
      action: 'youtube_search',
    };
  }

  /**
   * Open Spotify
   */
  private async openSpotify(request: ActionRequest): Promise<ActionResult> {
    const query = request.params.query as string ||
                  request.params.artist as string ||
                  request.params.song as string;

    const deepLink = deepLinksService.buildDeepLink('spotify', 'spotify_play', { query });
    if (deepLink) {
      const opened = await deepLinksService.openDeepLink(deepLink);
      if (opened) {
        return {
          success: true,
          message: 'Opening Spotify...',
          action: 'spotify_play',
          appOpened: 'spotify',
        };
      }
    }

    // Web fallback
    const webUrl = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
    await Linking.openURL(webUrl);

    return {
      success: true,
      message: 'Opening Spotify...',
      action: 'spotify_play',
    };
  }

  /**
   * Make a phone call
   */
  private async makePhoneCall(request: ActionRequest): Promise<ActionResult> {
    const phone = request.params.phone as string;

    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const url = `tel:${cleanPhone}`;

    await Linking.openURL(url);

    return {
      success: true,
      message: `Calling ${phone}...`,
      action: 'call',
    };
  }

  /**
   * Open WhatsApp
   */
  private async openWhatsApp(request: ActionRequest): Promise<ActionResult> {
    const phone = request.params.phone as string;
    const text = request.params.text as string || '';

    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const deepLink = deepLinksService.buildDeepLink('whatsapp', 'whatsapp', {
      phone: cleanPhone,
      text,
    });

    if (deepLink) {
      const opened = await deepLinksService.openDeepLink(deepLink);
      if (opened) {
        return {
          success: true,
          message: 'Opening WhatsApp...',
          action: 'whatsapp',
          appOpened: 'whatsapp',
        };
      }
    }

    // Web fallback
    const webUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    await Linking.openURL(webUrl);

    return {
      success: true,
      message: 'Opening WhatsApp...',
      action: 'whatsapp',
    };
  }

  /**
   * Resolve a spoken app name to a known-registry entry.
   */
  private resolveKnownApp(rawName: string): KnownApp | null {
    const normalized = rawName
      .toLowerCase()
      .replace(/\b(the|app|application|my)\b/g, ' ')
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return null;
    const key = APP_ALIASES[normalized] || normalized;
    return KNOWN_APPS[key] || null;
  }

  /**
   * Open any named app ("open Instagram"). Strategy:
   *  1. Known app → try its URL schemes (try/catch, not canOpenURL — Android 11+
   *     package-visibility makes canOpenURL lie for schemes not in <queries>).
   *  2. Android + known package → explicit launcher intent via
   *     expo-intent-launcher (required lazily: it's native-only).
   *  3. Known web fallback → open in browser.
   *  4. Unknown app → guess "<slug>://", then fall back to a store search so
   *     the user still gets a useful result.
   */
  private async openApp(request: ActionRequest): Promise<ActionResult> {
    const rawName = String(request.params.appName).trim();
    const known = this.resolveKnownApp(rawName);
    const label = known?.label || rawName;

    if (known) {
      for (const scheme of known.schemes) {
        try {
          await Linking.openURL(scheme);
          return { success: true, message: `Opening ${label}...`, action: 'app_open', appOpened: label };
        } catch {
          // Scheme not handled — try the next strategy.
        }
      }
      if (Platform.OS === 'android' && known.androidPackage) {
        try {
          const IntentLauncher = require('expo-intent-launcher');
          await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
            category: 'android.intent.category.LAUNCHER',
            packageName: known.androidPackage,
            flags: 0x10000000, // FLAG_ACTIVITY_NEW_TASK
          });
          return { success: true, message: `Opening ${label}...`, action: 'app_open', appOpened: label };
        } catch {
          // Not installed (or launcher refused) — fall through.
        }
      }
      if (known.web) {
        try {
          await Linking.openURL(known.web);
          return {
            success: true,
            message: `${label} isn't installed, so I opened it in the browser.`,
            action: 'app_open',
            appOpened: 'browser',
          };
        } catch {
          // Fall through to the store search.
        }
      }
    } else {
      // Unknown app: best-effort scheme guess ("signal" → signal://).
      const slug = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (slug) {
        try {
          await Linking.openURL(`${slug}://`);
          return { success: true, message: `Opening ${label}...`, action: 'app_open', appOpened: label };
        } catch {
          // Fall through to the store search.
        }
      }
    }

    // Last resort: show the app in the store so the user can install/open it.
    const storeUrl = Platform.OS === 'android'
      ? `market://search?q=${encodeURIComponent(rawName)}`
      : `https://apps.apple.com/search?term=${encodeURIComponent(rawName)}`;
    try {
      await Linking.openURL(storeUrl);
      return {
        success: true,
        message: `I couldn't find ${label} on this phone, so I'm showing it in the app store.`,
        action: 'app_open',
        appOpened: 'store',
      };
    } catch {
      return {
        success: false,
        message: `I couldn't open ${label}. It may not be installed on this phone.`,
        action: 'app_open',
        error: 'app_not_found',
      };
    }
  }

  /**
   * Open camera for photo capture
   */
  private async openCamera(): Promise<ActionResult> {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        return {
          success: false,
          message: 'Camera permission is required to take photos.',
          action: 'camera_open',
        };
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (result.canceled) {
        return {
          success: true,
          message: 'Photo capture cancelled.',
          action: 'camera_open',
        };
      }

      return {
        success: true,
        message: 'Photo captured successfully!',
        action: 'camera_open',
        data: {
          uri: result.assets[0].uri,
          width: result.assets[0].width,
          height: result.assets[0].height,
        },
      };
    } catch (error) {
      console.error('Camera error:', error);
      return {
        success: false,
        message: 'Failed to open camera. Please try again.',
        action: 'camera_open',
      };
    }
  }

  /**
   * Toggle flashlight using expo-camera torch
   */
  private async toggleFlashlight(): Promise<ActionResult> {
    try {
      // Check if we have camera permission (needed for flashlight)
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        return {
          success: false,
          message: 'Camera permission is required to use the flashlight.',
          action: 'flashlight',
        };
      }

      // Toggle flashlight state
      this.flashlightOn = !this.flashlightOn;

      // Note: Actual flashlight toggling requires a Camera component mounted
      // This returns the intent; the UI layer should handle the Camera mount
      return {
        success: true,
        message: this.flashlightOn ? 'Flashlight turned on!' : 'Flashlight turned off!',
        action: 'flashlight',
        data: {
          flashlightOn: this.flashlightOn,
          torchMode: this.flashlightOn ? 'on' : 'off',
        },
      };
    } catch (error) {
      console.error('Flashlight error:', error);
      return {
        success: false,
        message: 'Failed to toggle flashlight.',
        action: 'flashlight',
      };
    }
  }

  /**
   * Make emergency call
   */
  private async makeEmergencyCall(request: ActionRequest): Promise<ActionResult> {
    const emergencyNumber = request.params.number as string || '911';

    const url = `tel:${emergencyNumber}`;
    await Linking.openURL(url);

    return {
      success: true,
      message: `Calling emergency services (${emergencyNumber})...`,
      action: 'emergency_call',
    };
  }

  /**
   * Find nearby place
   */
  private async findNearbyPlace(type: string, request: ActionRequest): Promise<ActionResult> {
    return this.openNearbySearch({
      ...request,
      params: { type },
    });
  }

  /**
   * Open Amazon search
   */
  private async openAmazonSearch(request: ActionRequest): Promise<ActionResult> {
    const query = request.params.query as string;

    const deepLink = deepLinksService.buildDeepLink('amazon', 'amazon_search', { query });
    if (deepLink) {
      const opened = await deepLinksService.openDeepLink(deepLink);
      if (opened) {
        return {
          success: true,
          message: 'Searching Amazon...',
          action: 'amazon_search',
          appOpened: 'amazon',
        };
      }
    }

    // Web fallback
    const webUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
    await Linking.openURL(webUrl);

    return {
      success: true,
      message: 'Opening Amazon search...',
      action: 'amazon_search',
    };
  }
}

export const appLauncherService = new AppLauncherService();
export default appLauncherService;
