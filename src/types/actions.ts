/**
 * Actions Layer Types
 * Types for app launching, deep links, and action plugins
 */

// Action Categories
export type ActionCategory =
  | 'communication'
  | 'transportation'
  | 'navigation'
  | 'entertainment'
  | 'utility'
  | 'health'
  | 'shopping'
  | 'finance';

// Action Types
export type ActionType =
  // Communication
  | 'call'
  | 'message'
  | 'whatsapp'
  | 'email'
  | 'video_call'
  // Transportation
  | 'uber_ride'
  | 'ola_ride'
  | 'lyft_ride'
  | 'taxi'
  // Navigation
  | 'maps_navigate'
  | 'maps_search'
  | 'maps_nearby'
  // Entertainment
  | 'youtube_search'
  | 'youtube_play'
  | 'spotify_play'
  | 'music_play'
  // Utility
  | 'alarm_set'
  | 'timer_set'
  | 'calendar_add'
  | 'reminder_set'
  | 'camera_open'
  | 'flashlight'
  | 'app_open'
  // Health
  | 'emergency_call'
  | 'pharmacy_nearby'
  | 'hospital_nearby'
  // Shopping
  | 'amazon_search'
  | 'grocery_order'
  // Finance
  | 'upi_payment'
  | 'bank_app'
  // OTP
  | 'otp_assist';

// Base Action Request
export interface ActionRequest {
  type: ActionType;
  params: Record<string, unknown>;
  source: 'voice' | 'text' | 'intent' | 'proactive';
  timestamp: string;
}

// Action Result
export interface ActionResult {
  success: boolean;
  message: string;
  action?: ActionType;
  appOpened?: string;
  deepLink?: string;
  error?: string;
  requiresConfirmation?: boolean;
  confirmationData?: ActionConfirmation;
  data?: Record<string, any>;
}

// Action Confirmation
export interface ActionConfirmation {
  type: ActionType;
  title: string;
  description: string;
  icon: string;
  details?: ActionConfirmationDetail[];
  warnings?: string[];
  actions: ActionConfirmationAction[];
}

export interface ActionConfirmationDetail {
  label: string;
  value: string;
  icon?: string;
}

export interface ActionConfirmationAction {
  id: string;
  label: string;
  type: 'confirm' | 'cancel' | 'modify';
  style?: 'primary' | 'secondary' | 'danger';
}

// Deep Link Definition
export interface DeepLinkDefinition {
  appId: string;
  appName: string;
  packageName: {
    android: string;
    ios: string;
  };
  schemes: string[];
  storeUrl: {
    android: string;
    ios: string;
  };
  actions: DeepLinkAction[];
  category: ActionCategory;
  icon: string;
  isInstalled?: boolean;
}

export interface DeepLinkAction {
  type: ActionType;
  template: {
    android: string;
    ios: string;
    web?: string;
  };
  params: DeepLinkParam[];
  description: string;
}

export interface DeepLinkParam {
  name: string;
  type: 'string' | 'number' | 'location' | 'phone' | 'email';
  required: boolean;
  encode?: boolean;
  format?: string;
}

// Action Plugin Interface
export interface ActionPlugin {
  id: string;
  name: string;
  description: string;
  category: ActionCategory;
  supportedActions: ActionType[];
  icon: string;

  // Methods
  canHandle(request: ActionRequest): boolean;
  execute(request: ActionRequest): Promise<ActionResult>;
  getConfirmation(request: ActionRequest): ActionConfirmation | null;
  validate(request: ActionRequest): { valid: boolean; errors?: string[] };
}

// Location for navigation/rides
export interface ActionLocation {
  address?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

// Ride Request
export interface RideRequest extends ActionRequest {
  type: 'uber_ride' | 'ola_ride' | 'lyft_ride';
  params: {
    pickup?: ActionLocation;
    destination: ActionLocation;
    rideType?: 'economy' | 'premium' | 'pool' | 'auto';
  };
}

// Navigation Request
export interface NavigationRequest extends ActionRequest {
  type: 'maps_navigate' | 'maps_search' | 'maps_nearby';
  params: {
    destination?: ActionLocation;
    query?: string;
    mode?: 'driving' | 'walking' | 'transit' | 'cycling';
    nearbyType?: string;
  };
}

// Entertainment Request
export interface EntertainmentRequest extends ActionRequest {
  type: 'youtube_search' | 'youtube_play' | 'spotify_play' | 'music_play';
  params: {
    query?: string;
    artist?: string;
    song?: string;
    playlist?: string;
    genre?: string;
  };
}

// OTP Request (with safety constraints)
export interface OTPRequest extends ActionRequest {
  type: 'otp_assist';
  params: {
    action: 'read' | 'help';
    source?: string; // Where the OTP came from (bank name, app name)
    // NOTE: Never store the actual OTP value
  };
}

// Safety Constants
export const ACTION_SAFETY = {
  // Actions that require confirmation
  requiresConfirmation: [
    'uber_ride',
    'ola_ride',
    'lyft_ride',
    'emergency_call',
    'upi_payment',
  ],

  // Actions that are always allowed without confirmation
  alwaysAllowed: [
    'maps_search',
    'youtube_search',
    'music_play',
    'flashlight',
    'camera_open',
  ],

  // Sensitive patterns to never capture
  sensitivePatterns: [
    /password/i,
    /pin/i,
    /cvv/i,
    /credit.?card/i,
    /debit.?card/i,
    /account.?number/i,
    /social.?security/i,
    /ssn/i,
    /aadhaar/i,
    /pan.?card/i,
  ],

  // OTP safety rules
  otpRules: {
    neverStore: true,
    neverLog: true,
    readOnlyFromClipboard: true,
    maxDisplayTime: 30000, // 30 seconds
  },
};

// Action Metadata
export const ACTION_METADATA: Record<ActionType, {
  displayName: string;
  icon: string;
  category: ActionCategory;
  requiresConfirmation: boolean;
  requiresInternet: boolean;
}> = {
  // Communication
  call: { displayName: 'Phone Call', icon: '📞', category: 'communication', requiresConfirmation: true, requiresInternet: false },
  message: { displayName: 'Text Message', icon: '💬', category: 'communication', requiresConfirmation: true, requiresInternet: false },
  whatsapp: { displayName: 'WhatsApp', icon: '📱', category: 'communication', requiresConfirmation: true, requiresInternet: true },
  email: { displayName: 'Email', icon: '✉️', category: 'communication', requiresConfirmation: true, requiresInternet: true },
  video_call: { displayName: 'Video Call', icon: '📹', category: 'communication', requiresConfirmation: true, requiresInternet: true },

  // Transportation
  uber_ride: { displayName: 'Uber Ride', icon: '🚗', category: 'transportation', requiresConfirmation: true, requiresInternet: true },
  ola_ride: { displayName: 'Ola Ride', icon: '🚕', category: 'transportation', requiresConfirmation: true, requiresInternet: true },
  lyft_ride: { displayName: 'Lyft Ride', icon: '🚙', category: 'transportation', requiresConfirmation: true, requiresInternet: true },
  taxi: { displayName: 'Taxi', icon: '🚖', category: 'transportation', requiresConfirmation: true, requiresInternet: true },

  // Navigation
  maps_navigate: { displayName: 'Navigate', icon: '🗺️', category: 'navigation', requiresConfirmation: true, requiresInternet: true },
  maps_search: { displayName: 'Search Maps', icon: '🔍', category: 'navigation', requiresConfirmation: false, requiresInternet: true },
  maps_nearby: { displayName: 'Find Nearby', icon: '📍', category: 'navigation', requiresConfirmation: false, requiresInternet: true },

  // Entertainment
  youtube_search: { displayName: 'YouTube Search', icon: '▶️', category: 'entertainment', requiresConfirmation: false, requiresInternet: true },
  youtube_play: { displayName: 'Play on YouTube', icon: '🎬', category: 'entertainment', requiresConfirmation: false, requiresInternet: true },
  spotify_play: { displayName: 'Play on Spotify', icon: '🎵', category: 'entertainment', requiresConfirmation: false, requiresInternet: true },
  music_play: { displayName: 'Play Music', icon: '🎶', category: 'entertainment', requiresConfirmation: false, requiresInternet: false },

  // Utility
  alarm_set: { displayName: 'Set Alarm', icon: '⏰', category: 'utility', requiresConfirmation: true, requiresInternet: false },
  timer_set: { displayName: 'Set Timer', icon: '⏱️', category: 'utility', requiresConfirmation: false, requiresInternet: false },
  calendar_add: { displayName: 'Add to Calendar', icon: '📅', category: 'utility', requiresConfirmation: true, requiresInternet: false },
  reminder_set: { displayName: 'Set Reminder', icon: '🔔', category: 'utility', requiresConfirmation: true, requiresInternet: false },
  camera_open: { displayName: 'Open Camera', icon: '📷', category: 'utility', requiresConfirmation: false, requiresInternet: false },
  flashlight: { displayName: 'Flashlight', icon: '🔦', category: 'utility', requiresConfirmation: false, requiresInternet: false },
  app_open: { displayName: 'Open App', icon: '📲', category: 'utility', requiresConfirmation: true, requiresInternet: false },

  // Health
  emergency_call: { displayName: 'Emergency Call', icon: '🚨', category: 'health', requiresConfirmation: true, requiresInternet: false },
  pharmacy_nearby: { displayName: 'Find Pharmacy', icon: '💊', category: 'health', requiresConfirmation: false, requiresInternet: true },
  hospital_nearby: { displayName: 'Find Hospital', icon: '🏥', category: 'health', requiresConfirmation: false, requiresInternet: true },

  // Shopping
  amazon_search: { displayName: 'Amazon Search', icon: '📦', category: 'shopping', requiresConfirmation: false, requiresInternet: true },
  grocery_order: { displayName: 'Order Groceries', icon: '🛒', category: 'shopping', requiresConfirmation: true, requiresInternet: true },

  // Finance
  upi_payment: { displayName: 'UPI Payment', icon: '💳', category: 'finance', requiresConfirmation: true, requiresInternet: true },
  bank_app: { displayName: 'Bank App', icon: '🏦', category: 'finance', requiresConfirmation: false, requiresInternet: true },

  // OTP
  otp_assist: { displayName: 'OTP Helper', icon: '🔢', category: 'utility', requiresConfirmation: false, requiresInternet: false },
};
