/**
 * App Launcher Service
 * Handles launching apps and executing deep links
 */

import { Platform, Linking, Alert } from 'react-native';
import * as Location from 'expo-location';
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

class AppLauncherService {
  private lastAction: { type: ActionType; timestamp: number } | null = null;
  private actionCooldown = 2000; // 2 second cooldown between same actions

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
      case 'lyft_ride':
        const dest = request.params.destination as ActionLocation;
        if (dest?.address) {
          details.push({ label: 'To', value: dest.address, icon: '📍' });
        }
        if (request.params.rideType) {
          details.push({ label: 'Type', value: String(request.params.rideType), icon: '🚗' });
        }
        break;

      case 'maps_navigate':
        const navDest = request.params.destination as ActionLocation;
        if (navDest?.address) {
          details.push({ label: 'Destination', value: navDest.address, icon: '📍' });
        }
        if (request.params.mode) {
          details.push({ label: 'Mode', value: String(request.params.mode), icon: '🚶' });
        }
        break;
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
    let pickupLocation: ActionLocation | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        pickupLocation = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
      }
    } catch (error) {
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
   * Open camera (placeholder - would use expo-camera in real app)
   */
  private async openCamera(): Promise<ActionResult> {
    // In a real implementation, this would use expo-camera or the native camera intent
    return {
      success: true,
      message: 'Camera feature would open here...',
      action: 'camera_open',
    };
  }

  /**
   * Toggle flashlight (placeholder)
   */
  private async toggleFlashlight(): Promise<ActionResult> {
    // Would use expo-camera's flashlight feature
    return {
      success: true,
      message: 'Flashlight toggled!',
      action: 'flashlight',
    };
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
