/**
 * AppStateContext
 *
 * Provides shared app-level state (intent modals, check-ins, vault/app lock)
 * to the navigation tree. Extracted from App.tsx to support the React Navigation
 * migration so screens can consume this state via hooks rather than prop-drilling.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';

import { ParsedIntent } from '../types';
import { formatIntentForDisplay, getIntentSuggestion, isActionableIntent } from '../services/intents';
import { intentActionsService, ConfirmationData } from '../services/intentActions';
import { contactsService, Contact, ContactSearchResult } from '../services/contacts';
import { ActionConfirmation } from '../types/actions';
import { telemetryService } from '../services/telemetry';
import { checkGatewayHealth } from '../services/api';
import { careCircleSyncService } from '../services/careCircleSync';
import { biometricAuthService } from '../services/biometricAuth';
import { vaultService } from '../services/vault';
import { consentService } from '../services/consent';
import { auditLogService } from '../services/auditLog';
import { encryptedDatabaseService } from '../services/encryptedDatabase';
import { healthDataService } from '../services/healthData';
import { medicationService } from '../services/medication';
import { medicalRecordsService } from '../services/medicalRecords';
import { proactiveEngineService } from '../services/proactiveEngine';
import { calendarService } from '../services/calendar';
import { onboardingStore } from '../services/onboardingStore';
import { parseKarunaUrl } from '../services/incomingLinks';
import { CheckIn } from '../types/proactive';

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://karuna-api-production.up.railway.app';

interface AppStateContextValue {
  // Security
  isAppLocked: boolean;
  isVaultLocked: boolean;
  isSecurityInitialized: boolean;
  onAppUnlock: () => void;
  onVaultUnlock: () => void;

  // Onboarding
  isOnboardingComplete: boolean | null;
  onOnboardingComplete: () => void;

  // Deep link invite token
  pendingInviteToken: string | null;
  clearPendingInviteToken: () => void;

  // Intent modal
  showIntentModal: boolean;
  confirmationData: ConfirmationData | null;
  actionConfirmation: ActionConfirmation | null;
  multipleContacts: ContactSearchResult[];
  isActionLoading: boolean;
  onIntentDetected: (intent: ParsedIntent) => Promise<void>;
  handleSelectContact: (contact: Contact) => Promise<void>;
  handleConfirm: () => Promise<void>;
  handleCloseModal: () => void;

  // Check-ins
  pendingCheckIns: CheckIn[];
  activeCheckIn: CheckIn | null;
  showCheckInOverlay: boolean;
  handleCheckInBannerTap: () => void;
  handleCheckInDismiss: () => void;

  // Navigation helpers for vault lock gating
  isVaultUnlockPending: boolean;
  requestVaultNavigation: (destination: () => void) => void;
}

const AppStateContext = createContext<AppStateContextValue | undefined>(undefined);

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [isVaultLocked, setIsVaultLocked] = useState(true);
  const isVaultLockedRef = useRef(true);
  const [pendingVaultNav, setPendingVaultNav] = useState<(() => void) | null>(null);
  const [isSecurityInitialized, setIsSecurityInitialized] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);

  // Intent modal state
  const [showIntentModal, setShowIntentModal] = useState(false);
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null);
  const [actionConfirmation, setActionConfirmation] = useState<ActionConfirmation | null>(null);
  const [multipleContacts, setMultipleContacts] = useState<ContactSearchResult[]>([]);
  const [currentIntent, setCurrentIntent] = useState<ParsedIntent | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Check-in state
  const [pendingCheckIns, setPendingCheckIns] = useState<CheckIn[]>([]);
  const [activeCheckIn, setActiveCheckIn] = useState<CheckIn | null>(null);
  const [showCheckInOverlay, setShowCheckInOverlay] = useState(false);

  // Keep ref in sync for deep-link handler closure
  useEffect(() => { isVaultLockedRef.current = isVaultLocked; }, [isVaultLocked]);

  // ─── App initialization ──────────────────────────────────────────────────

  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      console.warn('[AppState] Initialization timed out after 10s');
      setIsSecurityInitialized(true);
    }, 10000);

    const isIOS26OrLater =
      Platform.OS === 'ios' &&
      typeof Platform.Version === 'string' &&
      parseInt(Platform.Version, 10) >= 26;

    if (Platform.OS !== 'web' && !isIOS26OrLater) {
      try {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
      } catch (err) {
        console.error('[AppState] Notification handler error:', err);
      }
    }

    let cancelled = false;

    const initializeApp = async () => {
      try {
        await Promise.race([biometricAuthService.initialize(), new Promise(r => setTimeout(r, 5000))]);
        await Promise.race([auditLogService.initialize(),       new Promise(r => setTimeout(r, 3000))]);
        await Promise.race([consentService.initialize(),        new Promise(r => setTimeout(r, 3000))]);
        await Promise.race([encryptedDatabaseService.open(),    new Promise(r => setTimeout(r, 3000))]);

        await onboardingStore.initialize();
        if (!cancelled) setIsOnboardingComplete(onboardingStore.isComplete());

        if (biometricAuthService.requiresAuthentication('app')) {
          if (!cancelled) setIsAppLocked(true);
        }
        if (!cancelled) setIsSecurityInitialized(true);
      } catch (err) {
        console.error('[AppState] Security init error:', err);
        if (!cancelled) setIsSecurityInitialized(true);
      }

      telemetryService.initialize(GATEWAY_URL);

      if (Platform.OS !== 'web') {
        checkGatewayHealth().catch(() => {});
      }

      try { await contactsService.loadContacts(); } catch {}
      try { await careCircleSyncService.initialize(GATEWAY_URL); } catch {}
      try {
        await healthDataService.initialize();
        await medicationService.initialize();
        await medicalRecordsService.initialize();
        await calendarService.initialize();
      } catch {}
      try { await proactiveEngineService.initialize(); } catch {}
    };

    initializeApp().catch((err) => {
      if (!cancelled) console.error('[AppState] Init failed:', err);
    });

    const handleAppStateChange = (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        setIsVaultLocked(true);
        vaultService.lock();
        biometricAuthService.lock();
        if (biometricAuthService.requiresAuthentication('app')) setIsAppLocked(true);
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);

    auditLogService.log({ action: 'app_opened', category: 'system', description: 'App was opened' }).catch(() => {});

    return () => {
      cancelled = true;
      clearTimeout(safetyTimeout);
      sub.remove();
      telemetryService.destroy();
      auditLogService.log({ action: 'app_closed', category: 'system', description: 'App was closed' }).catch(() => {});
    };
  }, []);

  // ─── Proactive check-ins ────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = proactiveEngineService.addListener((checkIns) => {
      setPendingCheckIns(checkIns);
      if (checkIns.length > 0 && (checkIns[0].priority === 'urgent' || checkIns[0].priority === 'high')) {
        setActiveCheckIn(checkIns[0]);
        setShowCheckInOverlay(true);
      }
    });
    const initial = proactiveEngineService.getPendingCheckIns?.() ?? [];
    if (initial.length > 0) setPendingCheckIns(initial);
    return unsubscribe;
  }, []);

  // ─── Deep links ──────────────────────────────────────────────────────────

  useEffect(() => {
    const VAULT_SCREENS = ['vault', 'vault_accounts', 'vault_medications', 'vault_documents', 'vault_doctors', 'vault_appointments', 'vault_contacts'];

    const handleUrl = (url: string) => {
      const parsed = parseKarunaUrl(url);
      if (!parsed) return;
      if (parsed.screen === 'join_circle') {
        if (parsed.params?.token) setPendingInviteToken(parsed.params.token);
        // Navigation handled by AppStateContext consumer
        return;
      }
      // Vault screens handled by requestVaultNavigation
      if (VAULT_SCREENS.includes(parsed.screen)) {
        if (biometricAuthService.requiresAuthentication('vault') && isVaultLockedRef.current) {
          // Can't navigate yet; defer until vault unlocks
          return;
        }
      }
      // Generic deep-link navigation TBD by consumer
    };

    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, []);

  // ─── Security handlers ───────────────────────────────────────────────────

  const onAppUnlock = useCallback(() => setIsAppLocked(false), []);

  const onVaultUnlock = useCallback(() => {
    setIsVaultLocked(false);
    isVaultLockedRef.current = false;
    if (pendingVaultNav) {
      pendingVaultNav();
      setPendingVaultNav(null);
    }
  }, [pendingVaultNav]);

  const requestVaultNavigation = useCallback((destination: () => void) => {
    if (biometricAuthService.requiresAuthentication('vault') && isVaultLockedRef.current) {
      setPendingVaultNav(() => destination);
      return;
    }
    destination();
  }, []);

  // ─── Onboarding ──────────────────────────────────────────────────────────

  const onOnboardingComplete = useCallback(() => {
    setIsOnboardingComplete(true);
  }, []);

  const clearPendingInviteToken = useCallback(() => setPendingInviteToken(null), []);

  // ─── Intent modal ────────────────────────────────────────────────────────

  const handleCloseModal = useCallback(() => {
    setShowIntentModal(false);
    setConfirmationData(null);
    setActionConfirmation(null);
    setMultipleContacts([]);
    setCurrentIntent(null);
    setIsActionLoading(false);
  }, []);

  const onIntentDetected = useCallback(async (intent: ParsedIntent) => {
    try {
      if (!isActionableIntent(intent)) return;
      setCurrentIntent(intent);
      const result = await intentActionsService.processIntent(intent);
      if (result.requiresConfirmation) {
        if (result.actionConfirmation) {
          setActionConfirmation(result.actionConfirmation);
          setConfirmationData(null);
          setShowIntentModal(true);
        } else if (result.confirmationData) {
          if (intent.entities.contact) {
            let contacts = contactsService.findByRelationship(intent.entities.contact);
            if (!contacts.length) contacts = contactsService.searchContacts(intent.entities.contact);
            if (contacts.length > 1 && contacts[0].matchScore <= 0.8) setMultipleContacts(contacts);
            else setMultipleContacts([]);
          }
          setConfirmationData(result.confirmationData);
          setActionConfirmation(null);
          setShowIntentModal(true);
        }
      }
    } catch (err) {
      console.error('[AppState] Intent handler error:', err);
    }
  }, []);

  const handleSelectContact = useCallback(async (contact: Contact) => {
    if (!currentIntent) return;
    const phoneNumber = contact.phoneNumbers?.[0];
    if (!phoneNumber) { handleCloseModal(); return; }
    if (currentIntent.type === 'call') {
      setConfirmationData({
        type: 'call',
        title: `Call ${contact.name}?`,
        description: `This will open your phone to call ${phoneNumber}`,
        contact,
        phoneNumber,
        onConfirm: async () => { await intentActionsService.executeCall(phoneNumber); handleCloseModal(); },
        onCancel: handleCloseModal,
      });
    } else if (currentIntent.type === 'message') {
      setConfirmationData({
        type: 'message',
        title: `Message ${contact.name}?`,
        description: 'Choose how to send your message',
        contact,
        phoneNumber,
        messageContent: currentIntent.entities.message || '',
        onConfirm: async () => { await intentActionsService.executeMessage(phoneNumber, currentIntent.entities.message); handleCloseModal(); },
        onCancel: handleCloseModal,
      });
    }
    setMultipleContacts([]);
  }, [currentIntent, handleCloseModal]);

  const handleConfirm = useCallback(async () => {
    if (actionConfirmation && currentIntent) {
      setIsActionLoading(true);
      try {
        const t = actionConfirmation.type;
        if (t === 'uber_ride' || t === 'ola_ride' || t === 'lyft_ride') {
          const provider = t === 'ola_ride' ? 'ola' : t === 'lyft_ride' ? 'lyft' : 'uber';
          await intentActionsService.executeRideAction(provider, currentIntent.entities.destination || '', currentIntent.entities.pickup);
        } else if (t === 'maps_navigate' || t === 'maps_search') {
          await intentActionsService.executeNavigationAction(currentIntent.entities.destination || currentIntent.entities.query || '');
        } else if (t === 'youtube_search' || t === 'youtube_play') {
          await intentActionsService.executeYouTubeAction(currentIntent.entities.query);
        } else if (t === 'spotify_play' || t === 'music_play') {
          await intentActionsService.executeMusicAction(currentIntent.entities.query || currentIntent.entities.song, currentIntent.entities.artist);
        } else if (t === 'otp_assist') {
          await intentActionsService.executeOTPAction(async (text) => { await Speech.speak(text, { language: 'en', rate: 0.8 }); });
        } else if (t === 'emergency_call') {
          await intentActionsService.executeEmergencyCall();
        } else if (t === 'whatsapp') {
          const num = actionConfirmation.details?.find((d: any) => d.label === 'Number')?.value;
          if (num) await intentActionsService.executeWhatsApp(num, currentIntent.entities.message);
        }
      } catch (err) {
        console.error('[AppState] Action execution error:', err);
      } finally {
        setIsActionLoading(false);
      }
      handleCloseModal();
      return;
    }
    if (!confirmationData) return;
    try { await confirmationData.onConfirm(); } catch (err) { console.error('[AppState] Confirm error:', err); }
    handleCloseModal();
  }, [actionConfirmation, confirmationData, currentIntent, handleCloseModal]);

  // ─── Check-in handlers ───────────────────────────────────────────────────

  const handleCheckInBannerTap = useCallback(() => {
    if (pendingCheckIns.length > 0) {
      setActiveCheckIn(pendingCheckIns[0]);
      setShowCheckInOverlay(true);
    }
  }, [pendingCheckIns]);

  const handleCheckInDismiss = useCallback(() => {
    setShowCheckInOverlay(false);
    setActiveCheckIn(null);
  }, []);

  return (
    <AppStateContext.Provider value={{
      isAppLocked,
      isVaultLocked,
      isSecurityInitialized,
      onAppUnlock,
      onVaultUnlock,
      isOnboardingComplete,
      onOnboardingComplete,
      pendingInviteToken,
      clearPendingInviteToken,
      showIntentModal,
      confirmationData,
      actionConfirmation,
      multipleContacts,
      isActionLoading,
      onIntentDetected,
      handleSelectContact,
      handleConfirm,
      handleCloseModal,
      pendingCheckIns,
      activeCheckIn,
      showCheckInOverlay,
      handleCheckInBannerTap,
      handleCheckInDismiss,
      isVaultUnlockPending: pendingVaultNav !== null,
      requestVaultNavigation,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}
