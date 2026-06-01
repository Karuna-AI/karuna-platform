import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';

import { ChatScreen } from '../components/ChatScreen';
import { SettingsScreen } from '../components/SettingsScreen';
import { VaultScreen } from '../components/VaultScreen';
import { VaultAccountScreen } from '../components/VaultAccountScreen';
import { VaultMedicationScreen } from '../components/VaultMedicationScreen';
import { VaultDocumentScreen } from '../components/VaultDocumentScreen';
import { VaultDoctorScreen } from '../components/VaultDoctorScreen';
import { VaultAppointmentScreen } from '../components/VaultAppointmentScreen';
import { VaultContactScreen } from '../components/VaultContactScreen';
import CareCircleScreen from '../components/CareCircleScreen';
import { SecuritySettingsScreen } from '../components/SecuritySettingsScreen';
import ConsentScreen from '../components/ConsentScreen';
import AuditLogScreen from '../components/AuditLogScreen';
import { HealthDashboard } from '../components/HealthDashboard';
import { ProactiveSettingsScreen } from '../components/ProactiveSettingsScreen';
import { MemoryViewer } from '../components/MemoryViewer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ChatProvider } from '../context/ChatContext';
import { useAppState } from '../context/AppStateContext';
import { CheckInBanner, CheckInOverlay } from '../components/CheckInCard';
import { IntentActionModal } from '../components/IntentActionModal';
import { useChatContext } from '../context/ChatContext';

import type { RootStackParamList, RootNavigationProp } from './types';
import type { RouteProp } from '@react-navigation/native';

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── Screen wrappers ─────────────────────────────────────────────────────────
// Each wrapper receives navigation from React Navigation and maps it to the
// callback props that existing screen components expect. Zero changes needed
// in the screen components themselves.

function ChatScreenWrapper() {
  const navigation = useNavigation<RootNavigationProp>();
  const {
    onIntentDetected,
    pendingCheckIns,
    showCheckInOverlay,
    activeCheckIn,
    handleCheckInBannerTap,
    handleCheckInDismiss,
    showIntentModal,
    confirmationData,
    actionConfirmation,
    multipleContacts,
    handleSelectContact,
    handleConfirm,
    handleCloseModal,
    isActionLoading,
    requestVaultNavigation,
    pendingInviteToken,
    clearPendingInviteToken,
  } = useAppState();

  return (
    <ErrorBoundary fallbackMessage="Karuna encountered an error loading the chat. Please try again.">
      <ChatProvider onIntentDetected={onIntentDetected}>
        <ChatWithOverlays
          pendingCheckIns={pendingCheckIns}
          showCheckInOverlay={showCheckInOverlay}
          activeCheckIn={activeCheckIn}
          onBannerTap={handleCheckInBannerTap}
          onDismiss={handleCheckInDismiss}
          navigation={navigation}
          requestVaultNavigation={requestVaultNavigation}
          pendingInviteToken={pendingInviteToken}
          clearPendingInviteToken={clearPendingInviteToken}
        />
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
      </ChatProvider>
    </ErrorBoundary>
  );
}

function ChatWithOverlays({
  pendingCheckIns,
  showCheckInOverlay,
  activeCheckIn,
  onBannerTap,
  onDismiss,
  navigation,
  requestVaultNavigation,
  pendingInviteToken,
  clearPendingInviteToken,
}: {
  pendingCheckIns: import('../types/proactive').CheckIn[];
  showCheckInOverlay: boolean;
  activeCheckIn: import('../types/proactive').CheckIn | null;
  onBannerTap: () => void;
  onDismiss: () => void;
  navigation: RootNavigationProp;
  requestVaultNavigation: (destination: () => void) => void;
  pendingInviteToken: string | null;
  clearPendingInviteToken: () => void;
}) {
  const { injectMessage } = useChatContext();

  const handleRespond = React.useCallback(
    (followUp: string) => { injectMessage('assistant', followUp); },
    [injectMessage]
  );

  return (
    <>
      <ChatScreen
        onOpenSettings={() => navigation.navigate('Settings')}
        onOpenVault={() => requestVaultNavigation(() => navigation.navigate('Vault'))}
        onOpenCareCircle={() => {
          navigation.navigate('CareCircle', { inviteToken: pendingInviteToken ?? undefined });
          clearPendingInviteToken();
        }}
        onOpenHealth={() => navigation.navigate('HealthDashboard')}
      />
      {pendingCheckIns.length > 0 && !showCheckInOverlay && (
        <CheckInBanner checkIns={pendingCheckIns} onTap={onBannerTap} />
      )}
      <CheckInOverlay
        visible={showCheckInOverlay}
        checkIn={activeCheckIn}
        onDismiss={onDismiss}
        onRespond={handleRespond}
      />
    </>
  );
}

function SettingsScreenWrapper() {
  const navigation = useNavigation<RootNavigationProp>();
  return (
    <SettingsScreen
      onClose={() => navigation.goBack()}
      onOpenSecurity={() => navigation.navigate('Security')}
      onOpenProactive={() => navigation.navigate('ProactiveSettings')}
      onOpenMemories={() => navigation.navigate('Memories')}
    />
  );
}

function VaultScreenWrapper() {
  const navigation = useNavigation<RootNavigationProp>();
  // Bump refreshKey each time the grid regains focus (e.g. returning from a
  // category add/edit/delete) so the category counts reload (N1).
  const [refreshKey, setRefreshKey] = React.useState(0);
  useFocusEffect(React.useCallback(() => { setRefreshKey((k) => k + 1); }, []));
  return (
    <VaultScreen
      refreshKey={refreshKey}
      onClose={() => navigation.goBack()}
      onNavigate={(screen: string) => {
        const screenMap: Record<string, keyof RootStackParamList> = {
          accounts:     'VaultAccounts',
          medications:  'VaultMedications',
          documents:    'VaultDocuments',
          doctors:      'VaultDoctors',
          appointments: 'VaultAppointments',
          contacts:     'VaultContacts',
        };
        const dest = screenMap[screen];
        if (dest) navigation.navigate(dest as any);
      }}
    />
  );
}

function CareCircleWrapper() {
  const navigation = useNavigation<RootNavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'CareCircle'>>();
  return (
    <CareCircleScreen
      onBack={() => navigation.goBack()}
      inviteToken={route.params?.inviteToken}
    />
  );
}

function SecurityWrapper() {
  const navigation = useNavigation<RootNavigationProp>();
  return (
    <SecuritySettingsScreen
      onBack={() => navigation.goBack()}
      onOpenConsent={() => navigation.navigate('Consent')}
      onOpenAuditLog={() => navigation.navigate('AuditLog')}
    />
  );
}

function HealthDashboardWrapper() {
  const navigation = useNavigation<RootNavigationProp>();
  return (
    <HealthDashboard
      onClose={() => navigation.goBack()}
      onOpenMedications={() => navigation.navigate('VaultMedications')}
    />
  );
}

// Simple wrappers for screens with only onClose/onBack
const mkSimple = (Component: React.ComponentType<any>, prop: string) =>
  function SimpleWrapper() {
    const navigation = useNavigation<RootNavigationProp>();
    return <Component {...{ [prop]: () => navigation.goBack() }} />;
  };

const VaultAccountsWrapper     = mkSimple(VaultAccountScreen,     'onClose');
const VaultMedicationsWrapper  = mkSimple(VaultMedicationScreen,  'onClose');
const VaultDocumentsWrapper    = mkSimple(VaultDocumentScreen,    'onClose');
const VaultDoctorsWrapper      = mkSimple(VaultDoctorScreen,      'onClose');
const VaultAppointmentsWrapper = mkSimple(VaultAppointmentScreen, 'onClose');
const VaultContactsWrapper     = mkSimple(VaultContactScreen,     'onClose');
const ConsentWrapper           = mkSimple(ConsentScreen,          'onBack');
const AuditLogWrapper          = mkSimple(AuditLogScreen,         'onBack');
const ProactiveSettingsWrapper = mkSimple(ProactiveSettingsScreen,'onBack');
const MemoriesWrapper          = mkSimple(MemoryViewer,           'onClose');

// ─── Root navigator ───────────────────────────────────────────────────────────

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Chat"
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        // Disable the iOS 26 swipe-back gesture for lock-sensitive screens
        // by default; individual screens can re-enable it.
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Chat"               component={ChatScreenWrapper}        />
      <Stack.Screen name="Settings"           component={SettingsScreenWrapper}    />
      <Stack.Screen name="Vault"              component={VaultScreenWrapper}       />
      <Stack.Screen name="VaultAccounts"      component={VaultAccountsWrapper}     />
      <Stack.Screen name="VaultMedications"   component={VaultMedicationsWrapper}  />
      <Stack.Screen name="VaultDocuments"     component={VaultDocumentsWrapper}    />
      <Stack.Screen name="VaultDoctors"       component={VaultDoctorsWrapper}      />
      <Stack.Screen name="VaultAppointments"  component={VaultAppointmentsWrapper} />
      <Stack.Screen name="VaultContacts"      component={VaultContactsWrapper}     />
      <Stack.Screen name="CareCircle"         component={CareCircleWrapper}        />
      <Stack.Screen name="Security"           component={SecurityWrapper}          />
      <Stack.Screen name="Consent"            component={ConsentWrapper}           />
      <Stack.Screen name="AuditLog"           component={AuditLogWrapper}          />
      <Stack.Screen name="HealthDashboard"    component={HealthDashboardWrapper}   />
      <Stack.Screen name="ProactiveSettings"  component={ProactiveSettingsWrapper} />
      <Stack.Screen name="Memories"           component={MemoriesWrapper}          />
    </Stack.Navigator>
  );
}
