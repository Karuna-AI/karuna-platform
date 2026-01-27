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
} from 'react-native';
import { consentService } from '../services/consent';
import {
  ConsentCategory,
  ConsentSummary,
  CONSENT_CATEGORY_INFO,
  CONSENT_GRANTEE_INFO,
  ConsentGrantee,
} from '../types/consent';

interface ConsentScreenProps {
  onBack: () => void;
}

export default function ConsentScreen({ onBack }: ConsentScreenProps): JSX.Element {
  const [summaries, setSummaries] = useState<ConsentSummary[]>([]);
  const [globalSharing, setGlobalSharing] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<ConsentCategory | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadConsentData();
  }, []);

  const loadConsentData = async () => {
    setIsLoading(true);
    await consentService.initialize();
    setSummaries(consentService.getConsentSummaries());
    setGlobalSharing(consentService.isGlobalSharingEnabled());
    setIsLoading(false);
  };

  const handleGlobalSharingToggle = async (enabled: boolean) => {
    if (enabled) {
      Alert.alert(
        'Enable Data Sharing',
        'This will allow your caregivers to access information you share with them. You can control exactly what they see in the settings below.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: async () => {
              await consentService.setGlobalDataSharing(true);
              setGlobalSharing(true);
            },
          },
        ]
      );
    } else {
      await consentService.setGlobalDataSharing(false);
      setGlobalSharing(false);
    }
  };

  const handleToggleConsent = async (
    category: ConsentCategory,
    grantee: ConsentGrantee,
    currentlyGranted: boolean
  ) => {
    if (currentlyGranted) {
      // Revoke
      const result = await consentService.revokeConsent(category, grantee);
      if (!result.success) {
        Alert.alert('Cannot Revoke', result.error || 'This consent cannot be revoked');
      }
    } else {
      // Grant
      const result = await consentService.grantConsent(category, grantee, 'read');
      if (!result.success) {
        Alert.alert('Cannot Grant', result.error || 'Failed to grant consent');
      }
    }
    loadConsentData();
  };

  const handleReviewComplete = async () => {
    await consentService.markAsReviewed();
    Alert.alert('Review Complete', 'Your consent preferences have been saved.');
  };

  const handleResetAll = () => {
    Alert.alert(
      'Reset All Permissions',
      'This will revoke all data sharing permissions. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await consentService.resetAllConsents();
            loadConsentData();
          },
        },
      ]
    );
  };

  const getSensitivityColor = (sensitivity: string) => {
    switch (sensitivity) {
      case 'critical':
        return '#F44336';
      case 'high':
        return '#FF9800';
      case 'medium':
        return '#FFC107';
      case 'low':
        return '#4CAF50';
      default:
        return '#999';
    }
  };

  const renderCategoryCard = (summary: ConsentSummary) => {
    const info = CONSENT_CATEGORY_INFO[summary.category];
    const isExpanded = expandedCategory === summary.category;
    const hasActiveConsents = summary.currentAccess.length > 0;

    return (
      <View key={summary.category} style={styles.categoryCard}>
        <TouchableOpacity
          style={styles.categoryHeader}
          onPress={() => setExpandedCategory(isExpanded ? null : summary.category)}
        >
          <View style={styles.categoryTitleRow}>
            <Text style={styles.categoryIcon}>{summary.icon}</Text>
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>{summary.displayName}</Text>
              <Text style={styles.categoryDescription} numberOfLines={1}>
                {summary.description}
              </Text>
            </View>
          </View>
          <View style={styles.categoryStatus}>
            <View
              style={[
                styles.sensitivityBadge,
                { backgroundColor: getSensitivityColor(info.sensitivity) + '20' },
              ]}
            >
              <Text
                style={[
                  styles.sensitivityText,
                  { color: getSensitivityColor(info.sensitivity) },
                ]}
              >
                {info.sensitivity.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.categoryDetails}>
            <Text style={styles.detailsLabel}>Who can access:</Text>

            {/* App Access */}
            <View style={styles.granteeRow}>
              <View style={styles.granteeInfo}>
                <Text style={styles.granteeName}>
                  {CONSENT_GRANTEE_INFO['app'].displayName}
                </Text>
                <Text style={styles.granteeDescription}>
                  {CONSENT_GRANTEE_INFO['app'].description}
                </Text>
              </View>
              <Switch
                value={consentService.hasConsent(summary.category, 'app')}
                onValueChange={(value) =>
                  handleToggleConsent(summary.category, 'app', !value)
                }
                trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                thumbColor={
                  consentService.hasConsent(summary.category, 'app') ? '#4CAF50' : '#F5F5F5'
                }
              />
            </View>

            {/* AI Assistant Access */}
            <View style={styles.granteeRow}>
              <View style={styles.granteeInfo}>
                <Text style={styles.granteeName}>
                  {CONSENT_GRANTEE_INFO['ai_assistant'].displayName}
                </Text>
                <Text style={styles.granteeDescription}>
                  {CONSENT_GRANTEE_INFO['ai_assistant'].description}
                </Text>
              </View>
              <Switch
                value={consentService.hasConsent(summary.category, 'ai_assistant')}
                onValueChange={(value) =>
                  handleToggleConsent(summary.category, 'ai_assistant', !value)
                }
                trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                thumbColor={
                  consentService.hasConsent(summary.category, 'ai_assistant')
                    ? '#4CAF50'
                    : '#F5F5F5'
                }
              />
            </View>

            {/* Caregiver Access (only if global sharing enabled) */}
            {globalSharing && (
              <>
                <View style={styles.granteeRow}>
                  <View style={styles.granteeInfo}>
                    <Text style={styles.granteeName}>
                      {CONSENT_GRANTEE_INFO['caregiver_owner'].displayName}
                    </Text>
                    <Text style={styles.granteeDescription}>
                      {CONSENT_GRANTEE_INFO['caregiver_owner'].description}
                    </Text>
                  </View>
                  <Switch
                    value={consentService.hasConsent(summary.category, 'caregiver_owner')}
                    onValueChange={(value) =>
                      handleToggleConsent(summary.category, 'caregiver_owner', !value)
                    }
                    trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                    thumbColor={
                      consentService.hasConsent(summary.category, 'caregiver_owner')
                        ? '#4CAF50'
                        : '#F5F5F5'
                    }
                  />
                </View>

                <View style={styles.granteeRow}>
                  <View style={styles.granteeInfo}>
                    <Text style={styles.granteeName}>
                      {CONSENT_GRANTEE_INFO['caregiver_member'].displayName}
                    </Text>
                    <Text style={styles.granteeDescription}>
                      {CONSENT_GRANTEE_INFO['caregiver_member'].description}
                    </Text>
                  </View>
                  <Switch
                    value={consentService.hasConsent(summary.category, 'caregiver_member')}
                    onValueChange={(value) =>
                      handleToggleConsent(summary.category, 'caregiver_member', !value)
                    }
                    trackColor={{ false: '#E0E0E0', true: '#81C784' }}
                    thumbColor={
                      consentService.hasConsent(summary.category, 'caregiver_member')
                        ? '#4CAF50'
                        : '#F5F5F5'
                    }
                  />
                </View>
              </>
            )}

            {/* Examples */}
            <View style={styles.examplesContainer}>
              <Text style={styles.examplesLabel}>Examples:</Text>
              {info.examples.map((example, index) => (
                <Text key={index} style={styles.exampleItem}>
                  • {example}
                </Text>
              ))}
            </View>

            {summary.requiresReview && (
              <View style={styles.reviewWarning}>
                <Text style={styles.reviewWarningText}>
                  ⚠️ This consent was granted over 90 days ago. Please review.
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  if (isLoading) {
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
        <Text style={styles.title}>Privacy & Consent</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Info Section */}
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🔒</Text>
          <Text style={styles.infoTitle}>Your Data, Your Control</Text>
          <Text style={styles.infoText}>
            You decide what information Karuna can access and who it can be shared with.
            All your data is encrypted and stored securely on your device.
          </Text>
        </View>

        {/* Global Sharing Toggle */}
        <View style={styles.globalToggleCard}>
          <View style={styles.globalToggleInfo}>
            <Text style={styles.globalToggleTitle}>Share with Caregivers</Text>
            <Text style={styles.globalToggleDescription}>
              Allow family members in your Care Circle to view your information
            </Text>
          </View>
          <Switch
            value={globalSharing}
            onValueChange={handleGlobalSharingToggle}
            trackColor={{ false: '#E0E0E0', true: '#81C784' }}
            thumbColor={globalSharing ? '#4CAF50' : '#F5F5F5'}
          />
        </View>

        {/* Category Cards */}
        <View style={styles.categoriesSection}>
          <Text style={styles.sectionTitle}>Data Categories</Text>
          {summaries.map(renderCategoryCard)}
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.reviewButton}
            onPress={handleReviewComplete}
          >
            <Text style={styles.reviewButtonText}>Mark All As Reviewed</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetAll}
          >
            <Text style={styles.resetButtonText}>Reset All Permissions</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  infoCard: {
    backgroundColor: '#E3F2FD',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1565C0',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565C0',
    textAlign: 'center',
    lineHeight: 20,
  },
  globalToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  globalToggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  globalToggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  globalToggleDescription: {
    fontSize: 13,
    color: '#666',
  },
  categoriesSection: {
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    marginLeft: 4,
  },
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 13,
    color: '#666',
  },
  categoryStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sensitivityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  sensitivityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  expandIcon: {
    fontSize: 12,
    color: '#999',
  },
  categoryDetails: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  detailsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    marginTop: 12,
  },
  granteeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  granteeInfo: {
    flex: 1,
    marginRight: 16,
  },
  granteeName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  granteeDescription: {
    fontSize: 12,
    color: '#666',
  },
  examplesContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  examplesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  exampleItem: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  reviewWarning: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
  },
  reviewWarningText: {
    fontSize: 12,
    color: '#E65100',
  },
  actionsSection: {
    margin: 16,
    gap: 12,
  },
  reviewButton: {
    backgroundColor: '#4A90A4',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  reviewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  resetButtonText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 40,
  },
});
