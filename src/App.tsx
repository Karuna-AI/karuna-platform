import React, { useCallback, useState, useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { ChatProvider } from './context/ChatContext';
import { SettingsProvider } from './context/SettingsContext';
import { ChatScreen } from './components/ChatScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { IntentActionModal } from './components/IntentActionModal';
import { VaultScreen } from './components/VaultScreen';
import { VaultAccountScreen } from './components/VaultAccountScreen';
import { VaultMedicationScreen } from './components/VaultMedicationScreen';
import { VaultDocumentScreen } from './components/VaultDocumentScreen';
import { VaultDoctorScreen } from './components/VaultDoctorScreen';
import { VaultAppointmentScreen } from './components/VaultAppointmentScreen';
import { VaultContactScreen } from './components/VaultContactScreen';
import CareCircleScreen from './components/CareCircleScreen';
import LockScreen from './components/LockScreen';
import SecuritySettingsScreen from './components/SecuritySettingsScreen';
import ConsentScreen from './components/ConsentScreen';
import AuditLogScreen from './components/AuditLogScreen';
import { ParsedIntent } from './types';
import { formatIntentForDisplay, getIntentSuggestion, isActionableIntent } from './services/intents';
import {
  intentActionsService,
  ConfirmationData,
  IntentActionResult,
} from './services/intentActions';
import { contactsService, Contact, ContactSearchResult } from './services/contacts';
import { ActionConfirmation } from './types/actions';
import { appLauncherService } from './services/appLauncher';
import { otpAssistantService } from './services/otpAssistant';
import * as Speech from 'expo-speech';
import { telemetryService } from './services/telemetry';
import { checkGatewayHealth } from './services/api';
import { careCircleSyncService } from './services/careCircleSync';
import { biometricAuthService } from './services/biometricAuth';
import { consentService } from './services/consent';
import { auditLogService } from './services/auditLog';
import { encryptedDatabaseService } from './services/encryptedDatabase';
import { HealthDashboard } from './components/HealthDashboard';
import { healthDataService } from './services/healthData';
import { medicationService } from './services/medication';
import { medicalRecordsService } from './services/medicalRecords';
import { proactiveEngineService } from './services/proactiveEngine';
import { calendarService } from './services/calendar';
import { CheckInBanner, CheckInOverlay } from './components/CheckInCard';
import { ProactiveSettingsScreen } from './components/ProactiveSettingsScreen';
import { CheckIn } from './types/proactive';
import { useChatContext } from './context/ChatContext';
import { onboardingStore } from './services/onboardingStore';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { MemoryViewer } from './components/MemoryViewer';
import { parseKarunaUrl } from './services/incomingLinks';
import * as Linking from 'expo-linking';

// Gateway URL - configure for your environment
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://karuna-api-production.up.railway.app';

type Screen = 'chat' | 'settings' | 'vault' | 'vault_accounts' | 'vault_medications' | 'vault_documents' | 'vault_doctors' | 'vault_appointments' | 'vault_contacts' | 'care_circle' | 'security' | 'consent' | 'audit_log' | 'health_dashboard' | 'proactive_settings' | 'memories';

/**
 * Wrapper that renders check-in components inside ChatProvider
 * so follow-up messages can be injected into the chat history.
 */
function CheckInWithChat({
  pendingCheckIns,
  showOverlay,
  activeCheckIn,
  onBannerTap,
  onDismiss,
}: {
  pendingCheckIns: CheckIn[];
  showOverlay: boolean;
  activeCheckIn: CheckIn | null;
  onBannerTap: () => void;
  onDismiss: () => void;
}): JSX.Element | null {
  const { injectMessage } = useChatContext();

  const handleRespond = useCallback((followUp: string) => {
    injectMessage('assistant', followUp);
  }, [injectMessage]);

  return (
    <>
      {pendingCheckIns.length > 0 && !showOverlay && (
        <CheckInBanner checkIns={pendingCheckIns} onTap={onBannerTap} />
      )}
      <CheckInOverlay
        visible={showOverlay}
        checkIn={activeCheckIn}
        onDismiss={onDismiss}
        onRespond={handleRespond}
      />
    </>
  );
}

function App(): JSX.Element {
  // Navigation state
  const [currentScreen, setCurrentScreen] = useState<Screen>('chat');

  // Onboarding state (null = still loading)
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);

  // Security state
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [isVaultLocked, setIsVaultLocked] = useState(true);
  const [pendingVaultNavigation, setPendingVaultNavigation] = useState<Screen | null>(null);
  const [isSecurityInitialized, setIsSecurityInitialized] = useState(false);

  // State for intent action modal
  const [showIntentModal, setShowIntentModal] = useState(false);
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null);
  const [actionConfirmation, setActionConfirmation] = useState<ActionConfirmation | null>(null);
  const [multipleContacts, setMultipleContacts] = useState<ContactSearchResult[]>([]);
  const [currentIntent, setCurrentIntent] = useState<ParsedIntent | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // State for proactive check-ins
  const [pendingCheckIns, setPendingCheckIns] = useState<CheckIn[]>([]);
  const [activeCheckIn, setActiveCheckIn] = useState<CheckIn | null>(null);
  const [showCheckInOverlay, setShowCheckInOverlay] = useState(false);

  // Initialize services on app start
  useEffect(() => {
    const initializeApp = async () => {
      // Initialize security services first
      try {
        await biometricAuthService.initialize();
        await auditLogService.initialize();
        await consentService.initialize();
        await encryptedDatabaseService.open();
        console.log('Security services initialized');

        // Initialize onboarding store
        await onboardingStore.initialize();
        setIsOnboardingComplete(onboardingStore.isComplete());

        // Check if app lock is required
        if (biometricAuthService.requiresAuthentication('app')) {
          setIsAppLocked(true);
        }

        setIsSecurityInitialized(true);

        // Log app open
        await auditLogService.log({
          action: 'app_opened',
          category: 'system',
          description: 'App was opened',
        });
      } catch (error) {
        console.error('Failed to initialize security services:', error);
        setIsSecurityInitialized(true); // Continue anyway
      }

      // Initialize telemetry
      telemetryService.initialize(GATEWAY_URL);

      // Check gateway health (skip on web to avoid CORS errors)
      if (Platform.OS !== 'web') {
        try {
          const isHealthy = await checkGatewayHealth();
          if (!isHealthy) {
            console.warn('AI Gateway is not available - using fallback mode');
          } else {
            console.debug('AI Gateway connected successfully');
          }
        } catch (error) {
          console.error('Failed to connect to AI Gateway:', error);
        }
      }

      // Load contacts
      try {
        await contactsService.loadContacts();
        console.log('Contacts loaded successfully');
      } catch (error) {
        console.error('Failed to load contacts:', error);
      }

      // Initialize care circle sync service
      try {
        await careCircleSyncService.initialize(GATEWAY_URL);
        console.log('Care circle sync service initialized');
      } catch (error) {
        console.error('Failed to initialize care circle sync:', error);
      }

      // Initialize health services
      try {
        await healthDataService.initialize();
        await medicationService.initialize();
        await medicalRecordsService.initialize();
        await calendarService.initialize();
        console.log('Health services initialized');
      } catch (error) {
        console.error('Failed to initialize health services:', error);
      }

      // Initialize proactive engine
      try {
        await proactiveEngineService.initialize();
        console.log('Proactive engine initialized');
      } catch (error) {
        console.error('Failed to initialize proactive engine:', error);
      }
    };

    initializeApp();

    // Handle app state changes for auto-lock
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Lock vault when app goes to background
        setIsVaultLocked(true);

        // Check if app should be locked
        if (biometricAuthService.requiresAuthentication('app')) {
          setIsAppLocked(true);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup on unmount
    return () => {
      subscription.remove();
      telemetryService.destroy();
      auditLogService.log({
        action: 'app_closed',
        category: 'system',
        description: 'App was closed',
      });
    };
  }, []);

  // Listen for proactive check-ins
  useEffect(() => {
    const unsubscribe = proactiveEngineService.addListener((checkIns) => {
      setPendingCheckIns(checkIns);
      // Show overlay for high priority check-ins
      if (checkIns.length > 0 && (checkIns[0].priority === 'urgent' || checkIns[0].priority === 'high')) {
        setActiveCheckIn(checkIns[0]);
        setShowCheckInOverlay(true);
      }
    });

    // Load initial check-ins
    const loadCheckIns = async () => {
      await proactiveEngineService.initialize();
      const pending = proactiveEngineService.getPendingCheckIns();
      setPendingCheckIns(pending);
    };
    loadCheckIns();

    return () => unsubscribe();
  }, []);

  // Handle incoming deep links
  useEffect(() => {
    const handleUrl = (url: string) => {
      const parsed = parseKarunaUrl(url);
      if (parsed) {
        console.debug('[DeepLink] Navigating to:', parsed.screen);
        setCurrentScreen(parsed.screen as Screen);
      }
    };

    // Handle URL that launched the app
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    // Handle URLs while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => subscription.remove();
  }, []);

  /**
   * Handle intent detection from chat
   */
  const handleIntentDetected = useCallback(async (intent: ParsedIntent) => {
    const displayMessage = formatIntentForDisplay(intent);
    const suggestion = getIntentSuggestion(intent);

    console.log('Intent detected:', {
      type: intent.type,
      confidence: intent.confidence,
      entities: intent.entities,
      display: displayMessage,
      suggestion,
    });

    // Only process actionable intents
    if (!isActionableIntent(intent)) {
      return;
    }

    setCurrentIntent(intent);

    // Process the intent
    const result = await intentActionsService.processIntent(intent);

    if (result.requiresConfirmation) {
      // Phase 13: Handle new action confirmations
      if (result.actionConfirmation) {
        setActionConfirmation(result.actionConfirmation);
        setConfirmationData(null);
        setShowIntentModal(true);
      } else if (result.confirmationData) {
        // Legacy confirmation data (call, message, reminder)
        // Check if we have multiple contact matches
        if (intent.entities.contact) {
          let contacts = contactsService.findByRelationship(intent.entities.contact);
          if (contacts.length === 0) {
            contacts = contactsService.searchContacts(intent.entities.contact);
          }

          if (contacts.length > 1 && contacts[0].matchScore <= 0.8) {
            // Multiple ambiguous matches - show picker
            setMultipleContacts(contacts);
          } else {
            setMultipleContacts([]);
          }
        }

        setConfirmationData(result.confirmationData);
        setActionConfirmation(null);
        setShowIntentModal(true);
      }
    } else if (!result.success) {
      // Intent processing failed - could show error or let AI handle it
      console.log('Intent processing failed:', result.message);
    }
  }, []);

  /**
   * Handle contact selection from picker
   */
  const handleSelectContact = useCallback(async (contact: Contact) => {
    if (!currentIntent) return;

    // Update confirmation with selected contact
    const phoneNumber = contact.phoneNumbers[0];

    if (currentIntent.type === 'call') {
      setConfirmationData({
        type: 'call',
        title: `Call ${contact.name}?`,
        description: `This will open your phone to call ${phoneNumber}`,
        contact,
        phoneNumber,
        onConfirm: async () => {
          await intentActionsService.executeCall(phoneNumber);
          handleCloseModal();
        },
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
        onConfirm: async () => {
          await intentActionsService.executeMessage(
            phoneNumber,
            currentIntent.entities.message
          );
          handleCloseModal();
        },
        onCancel: handleCloseModal,
      });
    }

    setMultipleContacts([]);
  }, [currentIntent]);

  /**
   * Handle confirmation
   */
  const handleConfirm = useCallback(async () => {
    // Phase 13: Handle new action confirmations
    if (actionConfirmation && currentIntent) {
      setIsActionLoading(true);
      try {
        const actionType = actionConfirmation.type;

        switch (actionType) {
          case 'uber_ride':
          case 'ola_ride':
          case 'lyft_ride': {
            const provider = actionType === 'ola_ride' ? 'ola'
              : actionType === 'lyft_ride' ? 'lyft' : 'uber';
            const destination = currentIntent.entities.destination || '';
            const pickup = currentIntent.entities.pickup;
            await intentActionsService.executeRideAction(provider, destination, pickup);
            break;
          }

          case 'maps_navigate':
          case 'maps_search': {
            const destination = currentIntent.entities.destination || currentIntent.entities.query || '';
            await intentActionsService.executeNavigationAction(destination);
            break;
          }

          case 'youtube_search':
          case 'youtube_play': {
            const query = currentIntent.entities.query;
            await intentActionsService.executeYouTubeAction(query);
            break;
          }

          case 'spotify_play':
          case 'music_play': {
            const query = currentIntent.entities.query || currentIntent.entities.song;
            const artist = currentIntent.entities.artist;
            await intentActionsService.executeMusicAction(query, artist);
            break;
          }

          case 'otp_assist': {
            // Use TTS to speak the OTP
            const speakFunction = async (text: string) => {
              await Speech.speak(text, {
                language: 'en',
                rate: 0.8,
              });
            };
            await intentActionsService.executeOTPAction(speakFunction);
            break;
          }

          case 'emergency_call': {
            await intentActionsService.executeEmergencyCall();
            break;
          }

          case 'whatsapp': {
            const phoneNumber = actionConfirmation.details?.find(d => d.label === 'Number')?.value;
            const message = currentIntent.entities.message;
            if (phoneNumber) {
              await intentActionsService.executeWhatsApp(phoneNumber, message);
            }
            break;
          }

          default:
            console.log('Unknown action type:', actionType);
        }
      } catch (error) {
        console.error('Action execution error:', error);
      } finally {
        setIsActionLoading(false);
      }

      handleCloseModal();
      return;
    }

    // Legacy confirmation handling
    if (!confirmationData) return;

    try {
      await confirmationData.onConfirm();
    } catch (error) {
      console.error('Action execution error:', error);
    }

    handleCloseModal();
  }, [confirmationData, actionConfirmation, currentIntent]);

  /**
   * Close modal and reset state
   */
  const handleCloseModal = useCallback(() => {
    setShowIntentModal(false);
    setConfirmationData(null);
    setActionConfirmation(null);
    setMultipleContacts([]);
    setCurrentIntent(null);
    setIsActionLoading(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setCurrentScreen('settings');
  }, []);

  const handleCloseSettings = useCallback(() => {
    setCurrentScreen('chat');
  }, []);

  const handleOpenVault = useCallback(() => {
    // Check if vault lock is required
    if (biometricAuthService.requiresAuthentication('vault') && isVaultLocked) {
      setPendingVaultNavigation('vault');
      return;
    }
    setCurrentScreen('vault');
  }, [isVaultLocked]);

  const handleCloseVault = useCallback(() => {
    setCurrentScreen('chat');
  }, []);

  const handleVaultNavigate = useCallback((screen: 'accounts' | 'medications' | 'doctors' | 'documents' | 'appointments' | 'contacts') => {
    setCurrentScreen(`vault_${screen}` as Screen);
  }, []);

  const handleVaultSubClose = useCallback(() => {
    setCurrentScreen('vault');
  }, []);

  const handleOpenCareCircle = useCallback(() => {
    setCurrentScreen('care_circle');
  }, []);

  const handleCloseCareCircle = useCallback(() => {
    setCurrentScreen('chat');
  }, []);

  const handleOpenSecurity = useCallback(() => {
    setCurrentScreen('security');
  }, []);

  const handleCloseSecurity = useCallback(() => {
    setCurrentScreen('settings');
  }, []);

  const handleOpenConsent = useCallback(() => {
    setCurrentScreen('consent');
  }, []);

  const handleCloseConsent = useCallback(() => {
    setCurrentScreen('security');
  }, []);

  const handleOpenAuditLog = useCallback(() => {
    setCurrentScreen('audit_log');
  }, []);

  const handleCloseAuditLog = useCallback(() => {
    setCurrentScreen('security');
  }, []);

  const handleOpenHealthDashboard = useCallback(() => {
    setCurrentScreen('health_dashboard');
  }, []);

  const handleCloseHealthDashboard = useCallback(() => {
    setCurrentScreen('chat');
  }, []);

  const handleOpenProactiveSettings = useCallback(() => {
    setCurrentScreen('proactive_settings');
  }, []);

  const handleCloseProactiveSettings = useCallback(() => {
    setCurrentScreen('settings');
  }, []);

  const handleOpenMemories = useCallback(() => {
    setCurrentScreen('memories');
  }, []);

  const handleCloseMemories = useCallback(() => {
    setCurrentScreen('settings');
  }, []);

  // Handle check-in interactions
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

  // handleCheckInRespond is now handled by CheckInWithChat component inside ChatProvider

  // Handle app unlock
  const handleAppUnlock = useCallback(() => {
    setIsAppLocked(false);
    auditLogService.log({
      action: 'auth_biometric_success',
      category: 'security',
      description: 'App unlocked',
    });
  }, []);

  // Handle vault unlock
  const handleVaultUnlock = useCallback(() => {
    setIsVaultLocked(false);
    if (pendingVaultNavigation) {
      setCurrentScreen(pendingVaultNavigation);
      setPendingVaultNavigation(null);
    }
    auditLogService.log({
      action: 'vault_unlocked',
      category: 'vault',
      description: 'Vault unlocked',
    });
  }, [pendingVaultNavigation]);

  // Render current screen
  const renderScreen = () => {
    // Show nothing while loading onboarding state
    if (isOnboardingComplete === null) {
      return null;
    }

    // Show onboarding if not complete
    if (!isOnboardingComplete) {
      return (
        <OnboardingFlow
          onComplete={() => setIsOnboardingComplete(true)}
        />
      );
    }

    // Show app lock screen if required
    if (isAppLocked && isSecurityInitialized) {
      return (
        <LockScreen
          onUnlock={handleAppUnlock}
          title="Welcome Back"
          subtitle="Enter your PIN to unlock Karuna"
          context="app"
        />
      );
    }

    // Show vault lock screen if pending vault navigation
    if (pendingVaultNavigation) {
      return (
        <LockScreen
          onUnlock={handleVaultUnlock}
          title="Unlock Vault"
          subtitle="Enter your PIN to access your secure vault"
          context="vault"
        />
      );
    }

    switch (currentScreen) {
      case 'settings':
        return (
          <SettingsScreen
            onClose={handleCloseSettings}
            onOpenSecurity={handleOpenSecurity}
            onOpenProactive={handleOpenProactiveSettings}
            onOpenMemories={handleOpenMemories}
          />
        );

      case 'vault':
        return (
          <VaultScreen
            onClose={handleCloseVault}
            onNavigate={handleVaultNavigate}
          />
        );

      case 'vault_accounts':
        return <VaultAccountScreen onClose={handleVaultSubClose} />;

      case 'vault_medications':
        return <VaultMedicationScreen onClose={handleVaultSubClose} />;

      case 'vault_documents':
        return <VaultDocumentScreen onClose={handleVaultSubClose} />;

      case 'vault_doctors':
        return <VaultDoctorScreen onClose={handleVaultSubClose} />;

      case 'vault_appointments':
        return <VaultAppointmentScreen onClose={handleVaultSubClose} />;

      case 'vault_contacts':
        return <VaultContactScreen onClose={handleVaultSubClose} />;

      case 'care_circle':
        return <CareCircleScreen onBack={handleCloseCareCircle} />;

      case 'security':
        return (
          <SecuritySettingsScreen
            onBack={handleCloseSecurity}
            onOpenConsent={handleOpenConsent}
            onOpenAuditLog={handleOpenAuditLog}
          />
        );

      case 'consent':
        return <ConsentScreen onBack={handleCloseConsent} />;

      case 'audit_log':
        return <AuditLogScreen onBack={handleCloseAuditLog} />;

      case 'health_dashboard':
        return (
          <HealthDashboard
            onClose={handleCloseHealthDashboard}
            onOpenMedications={() => setCurrentScreen('vault_medications')}
          />
        );

      case 'proactive_settings':
        return <ProactiveSettingsScreen onBack={handleCloseProactiveSettings} />;

      case 'memories':
        return <MemoryViewer onClose={handleCloseMemories} />;

      default:
        return (
          <>
            <ChatProvider onIntentDetected={handleIntentDetected}>
              <ChatScreen
                onOpenSettings={handleOpenSettings}
                onOpenVault={handleOpenVault}
                onOpenCareCircle={handleOpenCareCircle}
                onOpenHealth={handleOpenHealthDashboard}
              />
              {/* Check-in components inside ChatProvider for chat injection */}
              <CheckInWithChat
                pendingCheckIns={pendingCheckIns}
                showOverlay={showCheckInOverlay}
                activeCheckIn={activeCheckIn}
                onBannerTap={handleCheckInBannerTap}
                onDismiss={handleCheckInDismiss}
              />
            </ChatProvider>

            <IntentActionModal
              visible={showIntentModal}
              confirmationData={confirmationData}
              actionConfirmation={actionConfirmation}
              multipleContacts={multipleContacts.length > 1 ? multipleContacts : undefined}
              onSelectContact={handleSelectContact}
              onConfirm={handleConfirm}
              onCancel={handleCloseModal}
              isLoading={isActionLoading}
            />
          </>
        );
    }
  };

  return (
    <SettingsProvider>
      {renderScreen()}
    </SettingsProvider>
  );
}

export default App;
