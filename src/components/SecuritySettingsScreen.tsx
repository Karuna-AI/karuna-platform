import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Switch,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import {
  biometricAuthService,
  BiometricCapabilities,
  SecuritySettings,
} from '../services/biometricAuth';

interface SecuritySettingsScreenProps {
  onBack: () => void;
  onOpenConsent: () => void;
  onOpenAuditLog: () => void;
}

export default function SecuritySettingsScreen({
  onBack,
  onOpenConsent,
  onOpenAuditLog,
}: SecuritySettingsScreenProps): JSX.Element {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [biometricCapabilities, setBiometricCapabilities] = useState<BiometricCapabilities | null>(null);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    await biometricAuthService.initialize();
    setSettings(biometricAuthService.getSecuritySettings());

    const capabilities = await biometricAuthService.checkBiometricCapabilities();
    setBiometricCapabilities(capabilities);
  };

  const handleToggleAppLock = async (enabled: boolean) => {
    if (enabled && !settings?.hasPinSet) {
      Alert.alert('PIN Required', 'Please set up a PIN first to enable app lock.');
      return;
    }
    await biometricAuthService.setAppLockEnabled(enabled);
    loadSettings();
  };

  const handleToggleVaultLock = async (enabled: boolean) => {
    if (enabled && !settings?.hasPinSet) {
      Alert.alert('PIN Required', 'Please set up a PIN first to enable vault lock.');
      return;
    }
    await biometricAuthService.setVaultLockEnabled(enabled);
    loadSettings();
  };

  const handleToggleBiometric = async (enabled: boolean) => {
    if (enabled && !settings?.hasPinSet) {
      Alert.alert('PIN Required', 'Please set up a PIN first before enabling biometric.');
      return;
    }
    if (enabled && (!biometricCapabilities?.isAvailable || !biometricCapabilities?.isEnrolled)) {
      Alert.alert(
        'Biometric Not Available',
        'Please set up biometric authentication on your device first.'
      );
      return;
    }

    // Verify with biometric before enabling
    if (enabled) {
      const result = await biometricAuthService.authenticateWithBiometric(
        'Authenticate to enable biometric login'
      );
      if (!result.success) {
        Alert.alert('Authentication Failed', result.error || 'Please try again');
        return;
      }
    }

    await biometricAuthService.setBiometricEnabled(enabled);
    loadSettings();
  };

  const handleSetupPin = async () => {
    setPinError('');

    if (newPin.length < 4) {
      setPinError('PIN must be at least 4 digits');
      return;
    }

    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }

    setIsSettingUp(true);
    const result = await biometricAuthService.setupPIN(newPin);
    setIsSettingUp(false);

    if (result.success) {
      setShowPinSetup(false);
      setNewPin('');
      setConfirmPin('');
      Alert.alert('Success', 'PIN has been set up successfully');
      loadSettings();
    } else {
      setPinError(result.error || 'Failed to set up PIN');
    }
  };

  const handleRemovePin = () => {
    Alert.prompt(
      'Remove PIN',
      'Enter your current PIN to remove it',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async (currentPin) => {
            if (!currentPin) return;
            const result = await biometricAuthService.removePIN(currentPin);
            if (result.success) {
              Alert.alert('Success', 'PIN has been removed');
              loadSettings();
            } else {
              Alert.alert('Error', result.error || 'Failed to remove PIN');
            }
          },
        },
      ],
      'secure-text'
    );
  };

  const handleChangePin = () => {
    Alert.prompt(
      'Change PIN',
      'Enter your current PIN',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Next',
          onPress: async (currentPin) => {
            if (!currentPin) return;
            const result = await biometricAuthService.verifyPIN(currentPin);
            if (result.success) {
              setShowPinSetup(true);
            } else {
              Alert.alert('Error', 'Incorrect PIN');
            }
          },
        },
      ],
      'secure-text'
    );
  };

  const handleLockNow = async () => {
    await biometricAuthService.lock();
    Alert.alert('Locked', 'The app has been locked');
  };

  const getBiometricName = () => {
    if (!biometricCapabilities) return 'Biometric';
    if (biometricCapabilities.biometricTypes.includes('facial')) return 'Face ID';
    if (biometricCapabilities.biometricTypes.includes('fingerprint')) return 'Fingerprint';
    return 'Biometric';
  };

  const renderPinSetupModal = () => (
    <Modal visible={showPinSetup} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {settings?.hasPinSet ? 'Change PIN' : 'Set Up PIN'}
          </Text>
          <Text style={styles.modalSubtitle}>
            Create a 4-8 digit PIN to secure your data
          </Text>

          <View style={styles.pinInputContainer}>
            <Text style={styles.pinInputLabel}>New PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="Enter PIN"
            />
          </View>

          <View style={styles.pinInputContainer}>
            <Text style={styles.pinInputLabel}>Confirm PIN</Text>
            <TextInput
              style={styles.pinInput}
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="Confirm PIN"
            />
          </View>

          {pinError && <Text style={styles.pinError}>{pinError}</Text>}

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setShowPinSetup(false);
                setNewPin('');
                setConfirmPin('');
                setPinError('');
              }}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalConfirmButton, isSettingUp && styles.buttonDisabled]}
              onPress={handleSetupPin}
              disabled={isSettingUp}
            >
              <Text style={styles.modalConfirmText}>
                {isSettingUp ? 'Setting up...' : 'Set PIN'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (!settings) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Security Settings</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* PIN Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PIN Protection</Text>

          <View style={styles.settingCard}>
            {settings.hasPinSet ? (
              <>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>PIN is set</Text>
                    <Text style={styles.settingDescription}>
                      Your data is protected with a PIN
                    </Text>
                  </View>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
                <View style={styles.pinActions}>
                  <TouchableOpacity
                    style={styles.pinActionButton}
                    onPress={handleChangePin}
                  >
                    <Text style={styles.pinActionText}>Change PIN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pinActionButton, styles.pinActionDanger]}
                    onPress={handleRemovePin}
                  >
                    <Text style={[styles.pinActionText, styles.pinActionDangerText]}>
                      Remove PIN
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={styles.setupPinButton}
                onPress={() => setShowPinSetup(true)}
              >
                <Text style={styles.setupPinIcon}>🔐</Text>
                <View style={styles.setupPinInfo}>
                  <Text style={styles.setupPinTitle}>Set Up PIN</Text>
                  <Text style={styles.setupPinDescription}>
                    Protect your data with a PIN code
                  </Text>
                </View>
                <Text style={styles.setupPinArrow}>→</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Biometric Section */}
        {biometricCapabilities?.isAvailable && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{getBiometricName()}</Text>

            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Use {getBiometricName()}</Text>
                  <Text style={styles.settingDescription}>
                    Unlock with {getBiometricName().toLowerCase()} instead of PIN
                  </Text>
                </View>
                <Switch
                  value={settings.biometricEnabled}
                  onValueChange={handleToggleBiometric}
                  trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                  thumbColor={settings.biometricEnabled ? '#4CAF50' : '#F5F5F5'}
                  disabled={!settings.hasPinSet}
                />
              </View>
              {!biometricCapabilities.isEnrolled && (
                <Text style={styles.warningText}>
                  ⚠️ No {getBiometricName().toLowerCase()} enrolled on this device
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Lock Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lock Settings</Text>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>App Lock</Text>
                <Text style={styles.settingDescription}>
                  Require PIN/biometric to open the app
                </Text>
              </View>
              <Switch
                value={settings.appLockEnabled}
                onValueChange={handleToggleAppLock}
                trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                thumbColor={settings.appLockEnabled ? '#4CAF50' : '#F5F5F5'}
                disabled={!settings.hasPinSet}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Vault Lock</Text>
                <Text style={styles.settingDescription}>
                  Require PIN/biometric to access the vault
                </Text>
              </View>
              <Switch
                value={settings.vaultLockEnabled}
                onValueChange={handleToggleVaultLock}
                trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                thumbColor={settings.vaultLockEnabled ? '#4CAF50' : '#F5F5F5'}
                disabled={!settings.hasPinSet}
              />
            </View>
          </View>
        </View>

        {/* Privacy & Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Data</Text>

          <TouchableOpacity style={styles.linkCard} onPress={onOpenConsent}>
            <View style={styles.linkCardContent}>
              <Text style={styles.linkIcon}>✅</Text>
              <View style={styles.linkInfo}>
                <Text style={styles.linkTitle}>Privacy & Consent</Text>
                <Text style={styles.linkDescription}>
                  Manage what data is shared and with whom
                </Text>
              </View>
            </View>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkCard} onPress={onOpenAuditLog}>
            <View style={styles.linkCardContent}>
              <Text style={styles.linkIcon}>📋</Text>
              <View style={styles.linkInfo}>
                <Text style={styles.linkTitle}>Activity Log</Text>
                <Text style={styles.linkDescription}>
                  View who accessed your data and when
                </Text>
              </View>
            </View>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        {settings.hasPinSet && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>

            <TouchableOpacity
              style={styles.lockNowButton}
              onPress={handleLockNow}
            >
              <Text style={styles.lockNowText}>🔒 Lock Now</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {renderPinSetupModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    fontSize: 16,
    color: '#4A90A4',
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  settingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
  },
  checkmark: {
    fontSize: 20,
    color: '#4CAF50',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 16,
  },
  pinActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  pinActionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  pinActionDanger: {
    backgroundColor: '#FFEBEE',
  },
  pinActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A90A4',
  },
  pinActionDangerText: {
    color: '#F44336',
  },
  setupPinButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  setupPinIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  setupPinInfo: {
    flex: 1,
  },
  setupPinTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  setupPinDescription: {
    fontSize: 13,
    color: '#666',
  },
  setupPinArrow: {
    fontSize: 20,
    color: '#4A90A4',
  },
  warningText: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 12,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  linkCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  linkIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  linkInfo: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  linkDescription: {
    fontSize: 13,
    color: '#666',
  },
  linkArrow: {
    fontSize: 20,
    color: '#999',
  },
  lockNowButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4A90A4',
  },
  lockNowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90A4',
  },
  bottomPadding: {
    height: 40,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  pinInputContainer: {
    marginBottom: 16,
  },
  pinInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  pinInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    letterSpacing: 8,
    textAlign: 'center',
  },
  pinError: {
    color: '#F44336',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalConfirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#4A90A4',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
