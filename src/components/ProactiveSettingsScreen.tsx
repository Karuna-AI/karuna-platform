import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { proactiveEngineService } from '../services/proactiveEngine';
import { ProactivePreferences, CHECK_IN_TYPE_INFO, CheckInType } from '../types/proactive';

interface ProactiveSettingsScreenProps {
  onBack: () => void;
}

export const ProactiveSettingsScreen: React.FC<ProactiveSettingsScreenProps> = ({
  onBack,
}) => {
  const [preferences, setPreferences] = useState<ProactivePreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      await proactiveEngineService.initialize();
      const prefs = proactiveEngineService.getPreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('[ProactiveSettings] Load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = useCallback(
    async <K extends keyof ProactivePreferences>(
      key: K,
      value: ProactivePreferences[K]
    ) => {
      if (!preferences) return;

      const updated = { ...preferences, [key]: value };
      setPreferences(updated);
      await proactiveEngineService.updatePreferences({ [key]: value });
    },
    [preferences]
  );

  const updateCategory = useCallback(
    async (category: keyof ProactivePreferences['categories'], value: boolean) => {
      if (!preferences) return;

      const updatedCategories = { ...preferences.categories, [category]: value };
      const updated = { ...preferences, categories: updatedCategories };
      setPreferences(updated);
      await proactiveEngineService.updatePreferences({ categories: updatedCategories });
    },
    [preferences]
  );

  const updateQuietHours = useCallback(
    async (field: 'enabled' | 'startHour' | 'endHour', value: boolean | number) => {
      if (!preferences) return;

      const updatedQuietHours = { ...preferences.quietHours, [field]: value };
      const updated = { ...preferences, quietHours: updatedQuietHours };
      setPreferences(updated);
      await proactiveEngineService.updatePreferences({ quietHours: updatedQuietHours });
    },
    [preferences]
  );

  const formatHour = (hour: number): string => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  };

  if (isLoading || !preferences) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Check-In Settings</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Check-In Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Main Toggle */}
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Proactive Check-Ins</Text>
              <Text style={styles.settingDescription}>
                Allow Karuna to check in with helpful reminders
              </Text>
            </View>
            <Switch
              value={preferences.enabled}
              onValueChange={(value) => updatePreference('enabled', value)}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={preferences.enabled ? '#3b82f6' : '#f4f4f5'}
            />
          </View>
        </View>

        {preferences.enabled && (
          <>
            {/* Frequency */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Daily Frequency</Text>
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>
                  Maximum {preferences.maxNudgesPerDay} check-ins per day
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={5}
                  step={1}
                  value={preferences.maxNudgesPerDay}
                  onSlidingComplete={(value) => updatePreference('maxNudgesPerDay', value)}
                  minimumTrackTintColor="#3b82f6"
                  maximumTrackTintColor="#e5e7eb"
                  thumbTintColor="#3b82f6"
                />
                <View style={styles.sliderMarks}>
                  <Text style={styles.sliderMark}>1</Text>
                  <Text style={styles.sliderMark}>3</Text>
                  <Text style={styles.sliderMark}>5</Text>
                </View>
              </View>
            </View>

            {/* Categories */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Check-In Types</Text>
              <Text style={styles.sectionSubtitle}>
                Choose which types of reminders you'd like to receive
              </Text>

              <View style={styles.categoryList}>
                {Object.entries(preferences.categories).map(([category, enabled]) => {
                  // Find a check-in type that uses this category
                  const typeEntry = Object.entries(CHECK_IN_TYPE_INFO).find(
                    ([_, info]) => info.category === category
                  );
                  const typeInfo = typeEntry ? typeEntry[1] : null;

                  return (
                    <View key={category} style={styles.categoryRow}>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryIcon}>{typeInfo?.icon || '📋'}</Text>
                        <Text style={styles.categoryName}>
                          {category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ')}
                        </Text>
                      </View>
                      <Switch
                        value={enabled}
                        onValueChange={(value) =>
                          updateCategory(
                            category as keyof ProactivePreferences['categories'],
                            value
                          )
                        }
                        trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                        thumbColor={enabled ? '#3b82f6' : '#f4f4f5'}
                      />
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Quiet Hours */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quiet Hours</Text>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Enable Quiet Hours</Text>
                  <Text style={styles.settingDescription}>
                    No check-ins during these hours
                  </Text>
                </View>
                <Switch
                  value={preferences.quietHours.enabled}
                  onValueChange={(value) => updateQuietHours('enabled', value)}
                  trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                  thumbColor={preferences.quietHours.enabled ? '#3b82f6' : '#f4f4f5'}
                />
              </View>

              {preferences.quietHours.enabled && (
                <View style={styles.quietHoursConfig}>
                  <View style={styles.timeRow}>
                    <Text style={styles.timeLabel}>Start</Text>
                    <View style={styles.timeSelector}>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          updateQuietHours(
                            'startHour',
                            Math.max(0, preferences.quietHours.startHour - 1)
                          )
                        }
                      >
                        <Text style={styles.timeButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.timeValue}>
                        {formatHour(preferences.quietHours.startHour)}
                      </Text>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          updateQuietHours(
                            'startHour',
                            Math.min(23, preferences.quietHours.startHour + 1)
                          )
                        }
                      >
                        <Text style={styles.timeButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.timeRow}>
                    <Text style={styles.timeLabel}>End</Text>
                    <View style={styles.timeSelector}>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          updateQuietHours(
                            'endHour',
                            Math.max(0, preferences.quietHours.endHour - 1)
                          )
                        }
                      >
                        <Text style={styles.timeButtonText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.timeValue}>
                        {formatHour(preferences.quietHours.endHour)}
                      </Text>
                      <TouchableOpacity
                        style={styles.timeButton}
                        onPress={() =>
                          updateQuietHours(
                            'endHour',
                            Math.min(23, preferences.quietHours.endHour + 1)
                          )
                        }
                      >
                        <Text style={styles.timeButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Safety Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Safety</Text>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Concerning Pattern Alerts</Text>
                  <Text style={styles.settingDescription}>
                    Alert when unusual patterns are detected
                  </Text>
                </View>
                <Switch
                  value={preferences.concerningPatternAlert}
                  onValueChange={(value) =>
                    updatePreference('concerningPatternAlert', value)
                  }
                  trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                  thumbColor={preferences.concerningPatternAlert ? '#3b82f6' : '#f4f4f5'}
                />
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>Caregiver Alert Level</Text>
                  <Text style={styles.settingDescription}>
                    When to suggest calling caregiver
                  </Text>
                </View>
              </View>
              <View style={styles.alertLevelOptions}>
                {(['never', 'high', 'moderate', 'low'] as const).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.alertLevelOption,
                      preferences.caregiverAlertThreshold === level &&
                        styles.alertLevelOptionActive,
                    ]}
                    onPress={() => updatePreference('caregiverAlertThreshold', level)}
                  >
                    <Text
                      style={[
                        styles.alertLevelText,
                        preferences.caregiverAlertThreshold === level &&
                          styles.alertLevelTextActive,
                      ]}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: '#3b82f6',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  placeholder: {
    width: 50,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  section: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    color: '#1f2937',
  },
  settingDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  sliderContainer: {
    marginTop: 12,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderMarks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  sliderMark: {
    fontSize: 12,
    color: '#9ca3af',
  },
  categoryList: {
    marginTop: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 15,
    color: '#374151',
  },
  quietHoursConfig: {
    marginTop: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timeLabel: {
    fontSize: 15,
    color: '#374151',
  },
  timeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeButtonText: {
    fontSize: 20,
    color: '#374151',
    fontWeight: '500',
  },
  timeValue: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
    minWidth: 100,
    textAlign: 'center',
  },
  alertLevelOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  alertLevelOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  alertLevelOptionActive: {
    backgroundColor: '#3b82f6',
  },
  alertLevelText: {
    fontSize: 14,
    color: '#374151',
  },
  alertLevelTextActive: {
    color: '#ffffff',
  },
  bottomPadding: {
    height: 40,
  },
});

export default ProactiveSettingsScreen;
