import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { careCircleSyncService } from '../services/careCircleSync';

interface CareCircleScreenProps {
  onBack: () => void;
}

interface SyncStatus {
  connected: boolean;
  careCircleId: string | null;
  pendingChanges: number;
  lastSync: string | null;
}

export default function CareCircleScreen({ onBack }: CareCircleScreenProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStatus();

    const unsubscribe = careCircleSyncService.addSyncListener((event, data) => {
      console.log('[CareCircle] Sync event:', event, data);
      loadStatus();
    });

    return unsubscribe;
  }, []);

  const loadStatus = async () => {
    const syncStatus = await careCircleSyncService.getSyncStatus();
    setStatus(syncStatus);
    setIsLoading(false);
  };

  const handleJoinCircle = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Please enter an invitation code');
      return;
    }

    setIsJoining(true);

    const result = await careCircleSyncService.joinCircle(inviteCode.trim());

    if (result.success) {
      Alert.alert('Success', `You've joined ${result.circleName}!`);
      setInviteCode('');
      loadStatus();
    } else {
      Alert.alert('Error', result.error || 'Failed to join care circle');
    }

    setIsJoining(false);
  };

  const handleLeaveCircle = () => {
    Alert.alert(
      'Leave Care Circle',
      'Are you sure you want to leave this care circle? Your data will no longer sync with caregivers.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await careCircleSyncService.leaveCircle();
            loadStatus();
          },
        },
      ]
    );
  };

  const handleSync = async () => {
    setIsSyncing(true);
    const result = await careCircleSyncService.sync();

    if (result.success) {
      Alert.alert('Sync Complete', `Synced ${result.synced} items`);
    } else {
      Alert.alert('Sync Failed', result.error || 'Unable to sync');
    }

    loadStatus();
    setIsSyncing(false);
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;

    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Care Circle</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90A4" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Care Circle</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connection Status</Text>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: status?.connected ? '#4CAF50' : '#FF9800' },
              ]}
            />
            <Text style={styles.statusText}>
              {status?.connected ? 'Connected' : status?.careCircleId ? 'Offline' : 'Not Connected'}
            </Text>
          </View>

          {status?.careCircleId && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Sync:</Text>
                <Text style={styles.infoValue}>{formatLastSync(status.lastSync)}</Text>
              </View>

              {status.pendingChanges > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Pending Changes:</Text>
                  <Text style={[styles.infoValue, { color: '#FF9800' }]}>
                    {status.pendingChanges}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Actions */}
        {status?.careCircleId ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sync</Text>
              <Text style={styles.description}>
                Sync your data with your care circle to keep caregivers updated.
              </Text>

              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Sync Now</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Leave Circle</Text>
              <Text style={styles.description}>
                If you leave, your data will no longer be shared with your caregivers.
              </Text>

              <TouchableOpacity
                style={[styles.button, styles.dangerButton]}
                onPress={handleLeaveCircle}
              >
                <Text style={styles.buttonText}>Leave Care Circle</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Join a Care Circle</Text>
            <Text style={styles.description}>
              Enter the invitation code from your family member to join their care circle.
              This allows them to help manage your medications, appointments, and more.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter invitation code"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TouchableOpacity
              style={[styles.button, styles.primaryButton, !inviteCode.trim() && styles.disabledButton]}
              onPress={handleJoinCircle}
              disabled={isJoining || !inviteCode.trim()}
            >
              {isJoining ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Join Circle</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About Care Circles</Text>
          <Text style={styles.description}>
            Care Circles allow your family members to:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bullet}>• View your medication schedule</Text>
            <Text style={styles.bullet}>• See upcoming appointments</Text>
            <Text style={styles.bullet}>• Add helpful notes and reminders</Text>
            <Text style={styles.bullet}>• Access emergency contacts</Text>
          </View>
          <Text style={[styles.description, { marginTop: 12 }]}>
            Your sensitive information like bank accounts is protected and only visible
            to trusted family members with appropriate permissions.
          </Text>
        </View>
      </ScrollView>
    </View>
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
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#F9F9F9',
  },
  button: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#4A90A4',
  },
  dangerButton: {
    backgroundColor: '#F44336',
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  bulletList: {
    marginLeft: 8,
  },
  bullet: {
    fontSize: 14,
    color: '#666',
    lineHeight: 24,
  },
});
