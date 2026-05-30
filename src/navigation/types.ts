import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Chat: undefined;
  Settings: undefined;
  Vault: undefined;
  VaultAccounts: undefined;
  VaultMedications: undefined;
  VaultDocuments: undefined;
  VaultDoctors: undefined;
  VaultAppointments: undefined;
  VaultContacts: undefined;
  CareCircle: { inviteToken?: string };
  Security: undefined;
  Consent: undefined;
  AuditLog: undefined;
  HealthDashboard: undefined;
  ProactiveSettings: undefined;
  Memories: undefined;
};

export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
