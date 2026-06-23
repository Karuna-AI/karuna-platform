/**
 * "Open any app" from chat (open_app intent → app_open action).
 *
 * Covers: intent parsing (generic open/launch/start phrasing without stealing
 * the richer app-specific intents), display formatting, actionability, and the
 * appLauncher resolution chain (scheme → web fallback → store fallback,
 * confirmation gating).
 */

import { parseIntent, isActionableIntent, formatIntentForDisplay } from '../../src/services/intents';

// react-native's Linking is exercised directly by the launcher.
const mockOpenURL = jest.fn();
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: any) => o.ios },
  Linking: {
    openURL: (...args: any[]) => mockOpenURL(...args),
    canOpenURL: jest.fn().mockResolvedValue(false),
  },
  Alert: { alert: jest.fn() },
}));
jest.mock('expo-location', () => ({}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-camera', () => ({ Camera: {} }));
jest.mock('../../src/services/deepLinks', () => ({ deepLinksService: { buildDeepLink: jest.fn(), openDeepLink: jest.fn() } }));
jest.mock('../../src/services/auditLog', () => ({ auditLogService: { log: jest.fn().mockResolvedValue(undefined) } }));

import { appLauncherService } from '../../src/services/appLauncher';

describe('open_app intent parsing', () => {
  it.each([
    ['open instagram', 'instagram'],
    ['Open Facebook', 'facebook'],
    ['launch paytm', 'paytm'],
    ['start netflix', 'netflix'],
    ['open the camera app', 'camera'],
    ['can you open telegram', 'telegram'],
    ['open gmail please', 'gmail'],
  ])('parses "%s" as open_app(%s)', (text, expectedApp) => {
    const intent = parseIntent(text);
    expect(intent.type).toBe('open_app');
    expect(intent.entities.appName?.toLowerCase()).toBe(expectedApp);
  });

  it('keeps app-specific intents for whatsapp and youtube', () => {
    expect(parseIntent('open whatsapp').type).toBe('whatsapp');
    expect(parseIntent('open youtube').type).toBe('youtube');
  });

  it('"open whatsapp"/"open youtube" are actionable without entities (plain app-open)', () => {
    expect(isActionableIntent(parseIntent('open whatsapp'))).toBe(true);
    expect(isActionableIntent(parseIntent('open youtube'))).toBe(true);
    // but a bare mention without an open verb still defers to clarification
    expect(isActionableIntent(parseIntent('whatsapp'))).toBe(false);
  });

  it('does not hijack ordinary questions', () => {
    expect(parseIntent('what is the weather today?').type).not.toBe('open_app');
    expect(parseIntent('how do I get to the market').type).toBe('navigation');
  });

  it('is actionable when an app name is present', () => {
    const intent = parseIntent('open instagram');
    expect(isActionableIntent(intent)).toBe(true);
  });

  it('formats for display', () => {
    expect(formatIntentForDisplay(parseIntent('open instagram'))).toBe('Opening instagram');
  });
});

describe('emergency intent — no false positives (safety)', () => {
  // Regression: "help me" / "having" used to trigger an emergency 911
  // confirmation on everyday phrases. Found on-device 2026-06-23.
  it.each([
    'what can you help me with today?',
    'can you help me with my phone',
    'help me understand this',
    'help me find my glasses',
    "i'm having lunch",
    "i'm having a good day",
    'please help me set a reminder',
  ])('does NOT classify "%s" as emergency', (text) => {
    expect(parseIntent(text).type).not.toBe('emergency');
  });

  it.each([
    'this is an emergency',
    'call 911',
    'call an ambulance',
    'i need an ambulance',
    "i'm hurt",
    "i'm not feeling well",
    'i have chest pain',
    "i can't breathe",
    "something's wrong",
    "i've fallen",
    'help!',
    'somebody help',
  ])('still classifies genuine distress "%s" as emergency', (text) => {
    const intent = parseIntent(text);
    expect(intent.type).toBe('emergency');
    expect(isActionableIntent(intent)).toBe(true);
  });
});

describe('appLauncher app_open action', () => {
  // The launcher enforces a 2s same-action cooldown via Date.now(); advance a
  // fake clock between tests so consecutive app_open calls aren't rejected.
  const realNow = Date.now();
  let clockOffset = 0;

  beforeEach(() => {
    mockOpenURL.mockReset();
    clockOffset += 10_000;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow + clockOffset);
  });

  afterEach(() => {
    (Date.now as jest.Mock).mockRestore?.();
    jest.restoreAllMocks();
  });

  it('requires confirmation when not confirmed', async () => {
    const result = await appLauncherService.executeAction({
      type: 'app_open',
      params: { appName: 'instagram' },
      source: 'voice',
      timestamp: new Date().toISOString(),
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationData?.description).toBe('Open instagram?');
  });

  it('opens a known app via its URL scheme', async () => {
    mockOpenURL.mockResolvedValueOnce(undefined);
    const result = await appLauncherService.executeAction({
      type: 'app_open',
      params: { appName: 'Telegram', confirmed: true },
      source: 'voice',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
    expect(result.appOpened).toBe('Telegram');
    expect(mockOpenURL).toHaveBeenCalledWith('tg://resolve');
  });

  it('resolves aliases ("insta" → Instagram)', async () => {
    mockOpenURL.mockResolvedValueOnce(undefined);
    const result = await appLauncherService.executeAction({
      type: 'app_open',
      params: { appName: 'insta', confirmed: true },
      source: 'voice',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
    expect(mockOpenURL).toHaveBeenCalledWith('instagram://app');
  });

  it('falls back to the web when the scheme fails', async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error('no handler')) // nflx://
      .mockResolvedValueOnce(undefined); // web
    const result = await appLauncherService.executeAction({
      type: 'app_open',
      params: { appName: 'netflix', confirmed: true },
      source: 'voice',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
    expect(result.appOpened).toBe('browser');
    expect(mockOpenURL).toHaveBeenLastCalledWith('https://www.netflix.com');
  });

  it('falls back to a store search for unknown apps whose scheme guess fails', async () => {
    mockOpenURL
      .mockRejectedValueOnce(new Error('no handler')) // someunknownapp://
      .mockResolvedValueOnce(undefined); // store search
    const result = await appLauncherService.executeAction({
      type: 'app_open',
      params: { appName: 'Some Unknown App', confirmed: true },
      source: 'voice',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
    expect(result.appOpened).toBe('store');
    expect(String(mockOpenURL.mock.calls[1][0])).toContain('apps.apple.com/search');
  });

  it('rejects an empty app name', async () => {
    const result = await appLauncherService.executeAction({
      type: 'app_open',
      params: { appName: '   ', confirmed: true },
      source: 'voice',
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
