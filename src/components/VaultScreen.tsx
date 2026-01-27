import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { vaultService } from '../services/vault';

interface VaultScreenProps {
  onClose: () => void;
  onNavigate: (screen: 'accounts' | 'medications' | 'doctors' | 'documents' | 'appointments' | 'contacts') => void;
}

interface VaultSummary {
  accounts: number;
  contacts: number;
  medications: number;
  doctors: number;
  documents: number;
  appointments: number;
}

export function VaultScreen({ onClose, onNavigate }: VaultScreenProps): JSX.Element {
  const [isLocked, setIsLocked] = useState(true);
  const [hasVault, setHasVault] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isCreatingVault, setIsCreatingVault] = useState(false);
  const [summary, setSummary] = useState<VaultSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check vault status on mount
  useEffect(() => {
    checkVaultStatus();
  }, []);

  const checkVaultStatus = async () => {
    setIsLoading(true);
    try {
      const exists = await vaultService.hasVault();
      setHasVault(exists);
      setIsLocked(!vaultService.isUnlocked());

      if (vaultService.isUnlocked()) {
        const vaultSummary = await vaultService.getVaultSummary();
        setSummary(vaultSummary);
      }
    } catch (err) {
      console.error('Vault status check failed:', err);
    }
    setIsLoading(false);
  };

  const handleUnlock = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    setIsLoading(true);
    setError(null);

    const success = await vaultService.unlock(pin);
    if (success) {
      setIsLocked(false);
      setShowPinModal(false);
      setPin('');
      const vaultSummary = await vaultService.getVaultSummary();
      setSummary(vaultSummary);
    } else {
      setError('Incorrect PIN. Please try again.');
    }

    setIsLoading(false);
  };

  const handleCreateVault = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    const success = await vaultService.createVault(pin);
    if (success) {
      setHasVault(true);
      setIsLocked(false);
      setShowPinModal(false);
      setIsCreatingVault(false);
      setPin('');
      setConfirmPin('');
      setSummary({
        accounts: 0,
        contacts: 0,
        medications: 0,
        doctors: 0,
        documents: 0,
        appointments: 0,
      });
      Alert.alert('Success', 'Your secure vault has been created!');
    } else {
      setError('Failed to create vault. Please try again.');
    }

    setIsLoading(false);
  };

  const handleLock = useCallback(() => {
    Alert.alert(
      'Lock Vault',
      'Are you sure you want to lock your vault?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock',
          onPress: () => {
            vaultService.lock();
            setIsLocked(true);
            setSummary(null);
          },
        },
      ]
    );
  }, []);

  const openPinModal = (creating: boolean) => {
    setIsCreatingVault(creating);
    setPin('');
    setConfirmPin('');
    setError(null);
    setShowPinModal(true);
  };

  if (isLoading && !showPinModal) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Knowledge Vault</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Loading vault...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Knowledge Vault</Text>
        {!isLocked ? (
          <TouchableOpacity onPress={handleLock} style={styles.lockButton}>
            <Text style={styles.lockButtonText}>Lock</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Locked State */}
        {isLocked && (
          <View style={styles.lockedContainer}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedTitle}>
              {hasVault ? 'Vault is Locked' : 'Create Your Secure Vault'}
            </Text>
            <Text style={styles.lockedSubtitle}>
              {hasVault
                ? 'Enter your PIN to access your secure information'
                : 'Store important information securely on your device'}
            </Text>

            {hasVault ? (
              <TouchableOpacity
                style={styles.unlockButton}
                onPress={() => openPinModal(false)}
              >
                <Text style={styles.unlockButtonText}>Unlock Vault</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => openPinModal(true)}
              >
                <Text style={styles.createButtonText}>Create Vault</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Unlocked State - Category Grid */}
        {!isLocked && (
          <>
            <Text style={styles.sectionTitle}>What would you like to manage?</Text>

            <View style={styles.categoryGrid}>
              <VaultCategoryButton
                icon="🏦"
                title="Accounts"
                count={summary?.accounts || 0}
                description="Bank, insurance, IDs"
                onPress={() => onNavigate('accounts')}
              />

              <VaultCategoryButton
                icon="💊"
                title="Medications"
                count={summary?.medications || 0}
                description="Medicines & schedules"
                onPress={() => onNavigate('medications')}
              />

              <VaultCategoryButton
                icon="👨‍⚕️"
                title="Doctors"
                count={summary?.doctors || 0}
                description="Healthcare providers"
                onPress={() => onNavigate('doctors')}
              />

              <VaultCategoryButton
                icon="📄"
                title="Documents"
                count={summary?.documents || 0}
                description="Property, certificates"
                onPress={() => onNavigate('documents')}
              />

              <VaultCategoryButton
                icon="📅"
                title="Appointments"
                count={summary?.appointments || 0}
                description="Upcoming visits"
                onPress={() => onNavigate('appointments')}
              />

              <VaultCategoryButton
                icon="👥"
                title="Contacts"
                count={summary?.contacts || 0}
                description="Family & caregivers"
                onPress={() => onNavigate('contacts')}
              />
            </View>

            <View style={styles.helpBox}>
              <Text style={styles.helpIcon}>💡</Text>
              <Text style={styles.helpText}>
                You can ask me questions like:{'\n'}
                "What's my SBI account number?"{'\n'}
                "Where are my property documents?"{'\n'}
                "What medicines do I take?"
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* PIN Modal */}
      <Modal
        visible={showPinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isCreatingVault ? 'Create Your Vault PIN' : 'Enter Your PIN'}
            </Text>

            <Text style={styles.modalSubtitle}>
              {isCreatingVault
                ? 'Choose a 4-6 digit PIN to protect your vault'
                : 'Enter your PIN to unlock'}
            </Text>

            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={setPin}
              placeholder="Enter PIN"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              autoFocus
            />

            {isCreatingVault && (
              <TextInput
                style={styles.pinInput}
                value={confirmPin}
                onChangeText={setConfirmPin}
                placeholder="Confirm PIN"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
              />
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPinModal(false);
                  setPin('');
                  setConfirmPin('');
                  setError(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={isCreatingVault ? handleCreateVault : handleUnlock}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>
                    {isCreatingVault ? 'Create' : 'Unlock'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface VaultCategoryButtonProps {
  icon: string;
  title: string;
  count: number;
  description: string;
  onPress: () => void;
}

function VaultCategoryButton({
  icon,
  title,
  count,
  description,
  onPress,
}: VaultCategoryButtonProps): JSX.Element {
  return (
    <TouchableOpacity style={styles.categoryButton} onPress={onPress}>
      <Text style={styles.categoryIcon}>{icon}</Text>
      <Text style={styles.categoryTitle}>{title}</Text>
      <Text style={styles.categoryCount}>
        {count} {count === 1 ? 'item' : 'items'}
      </Text>
      <Text style={styles.categoryDescription}>{description}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 18,
    color: '#2196F3',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  lockButton: {
    padding: 8,
  },
  lockButtonText: {
    fontSize: 18,
    color: '#FF5722',
    fontWeight: '600',
  },
  placeholder: {
    width: 60,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: '#666',
  },

  // Locked state
  lockedContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  lockedIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  lockedTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  lockedSubtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 32,
    lineHeight: 26,
  },
  unlockButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 12,
    minWidth: 200,
  },
  unlockButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 48,
    paddingVertical: 18,
    borderRadius: 12,
    minWidth: 200,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Category grid
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryButton: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 160,
  },
  categoryIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  categoryCount: {
    fontSize: 16,
    color: '#2196F3',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },

  // Help box
  helpBox: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 20,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  helpIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  helpText: {
    flex: 1,
    fontSize: 16,
    color: '#1565C0',
    lineHeight: 24,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  pinInput: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  modalCancelText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    padding: 16,
    marginLeft: 8,
    borderRadius: 12,
    backgroundColor: '#2196F3',
  },
  modalConfirmText: {
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    fontWeight: 'bold',
  },
});

export default VaultScreen;
