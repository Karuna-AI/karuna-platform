import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Platform,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { healthDataService } from '../services/healthData';
import { medicationService } from '../services/medication';
import { VitalType, VITAL_TYPE_INFO, VitalSummary, VitalReading } from '../types/health';

import { getColors } from '../utils/accessibility';

// Vital types a user can log by hand, with their unit and whether they need a
// second value (blood pressure: systolic + diastolic).
const LOGGABLE_VITALS: { type: VitalType; label: string; unit: string; secondary?: string }[] = [
  { type: 'heart_rate', label: 'Heart rate', unit: 'bpm' },
  { type: 'blood_pressure', label: 'Blood pressure', unit: 'mmHg', secondary: 'diastolic' },
  { type: 'blood_glucose', label: 'Blood glucose', unit: 'mg/dL' },
  { type: 'weight', label: 'Weight', unit: 'kg' },
  { type: 'temperature', label: 'Temperature', unit: '°C' },
  { type: 'oxygen_saturation', label: 'Oxygen (SpO₂)', unit: '%' },
];

/**
 * Build a VitalReading payload from manual entry, or null if the value(s) are
 * invalid. Pure + exported for testing. blood_pressure carries diastolic in
 * secondaryValue (mapped to {systolic,diastolic} on upload).
 */
export function buildVitalReading(
  type: VitalType,
  value: string,
  secondary?: string,
): Omit<VitalReading, 'id' | 'timestamp'> | null {
  const opt = LOGGABLE_VITALS.find((o) => o.type === type);
  if (!opt) return null;
  const v = Number(value);
  if (!value.trim() || Number.isNaN(v) || v <= 0) return null;
  const reading: Omit<VitalReading, 'id' | 'timestamp'> = {
    type,
    value: v,
    unit: opt.unit,
    source: 'manual',
  };
  if (opt.secondary) {
    const s = Number(secondary);
    if (!secondary || !secondary.trim() || Number.isNaN(s) || s <= 0) return null;
    reading.secondaryValue = s;
  }
  return reading;
}

const c = getColors();
const { width } = Dimensions.get('window');

interface HealthDashboardProps {
  onClose: () => void;
  onOpenMedications: () => void;
}

export const HealthDashboard: React.FC<HealthDashboardProps> = ({
  onClose,
  onOpenMedications,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stepsData, setStepsData] = useState<{
    current: number;
    goal: number;
    percentage: number;
    status: string;
    message: string;
  } | null>(null);
  const [vitalSummaries, setVitalSummaries] = useState<VitalSummary[]>([]);
  const [medicationSchedule, setMedicationSchedule] = useState<{
    taken: number;
    total: number;
    nextDose: { name: string; time: string } | null;
  }>({ taken: 0, total: 0, nextDose: null });

  // Manual vital-entry modal
  const [vitalModalVisible, setVitalModalVisible] = useState(false);
  const [vitalType, setVitalType] = useState<VitalType>('heart_rate');
  const [vitalValue, setVitalValue] = useState('');
  const [vitalSecondary, setVitalSecondary] = useState('');
  const [savingVital, setSavingVital] = useState(false);

  const openVitalModal = () => {
    setVitalType('heart_rate');
    setVitalValue('');
    setVitalSecondary('');
    setVitalModalVisible(true);
  };

  const saveVital = async () => {
    const reading = buildVitalReading(vitalType, vitalValue, vitalSecondary);
    if (!reading) {
      Alert.alert('Check your entry', 'Please enter a valid number for the reading.');
      return;
    }
    setSavingVital(true);
    try {
      await healthDataService.addVitalReading(reading);
      setVitalModalVisible(false);
      await loadData();
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving your reading. Please try again.');
    } finally {
      setSavingVital(false);
    }
  };

  const currentVitalOption = LOGGABLE_VITALS.find((o) => o.type === vitalType)!;

  const loadData = useCallback(async () => {
    try {
      await healthDataService.initialize();
      await medicationService.initialize();

      // Load steps data
      const steps = healthDataService.getStepsComparison();
      setStepsData(steps);

      // Load vital summaries
      const vitalTypes: VitalType[] = ['heart_rate', 'blood_pressure', 'blood_glucose', 'weight'];
      const summaries = vitalTypes.map((type) =>
        healthDataService.getVitalSummary(type, 'day')
      );
      setVitalSummaries(summaries.filter((s) => s.latestReading));

      // Load medication data
      const schedule = medicationService.getTodaySchedule();
      const taken = schedule.filter((s) => s.dose?.status === 'taken').length;
      const nextDose = medicationService.getNextDose();

      setMedicationSchedule({
        taken,
        total: schedule.length,
        nextDose: nextDose
          ? {
              name: nextDose.medication.name,
              time: nextDose.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
          : null,
      });
    } catch (error) {
      console.error('[HealthDashboard] Load error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await healthDataService.syncFromHealthPlatform();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'exceeded':
        return c.success;
      case 'met':
        return c.primary;
      case 'near':
        return c.warning;
      default:
        return c.textSecondary;
    }
  };

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'up':
        return '^';
      case 'down':
        return 'v';
      case 'stable':
        return '-';
      default:
        return '';
    }
  };

  const isVitalInRange = (summary: VitalSummary): boolean | null => {
    if (!summary.latestReading || !summary.normalRange) return null;
    const value = summary.latestReading.value;
    return value >= summary.normalRange.min && value <= summary.normalRange.max;
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Health Dashboard</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading health data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Health Dashboard</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Steps Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>
              {VITAL_TYPE_INFO.steps.icon}
            </Text>
            <Text style={styles.cardTitle}>Today's Steps</Text>
          </View>
          {stepsData ? (
            <View style={styles.stepsContent}>
              <Text style={[styles.stepsCount, { color: getStatusColor(stepsData.status) }]}>
                {stepsData.current.toLocaleString()}
              </Text>
              <Text style={styles.stepsGoal}>of {stepsData.goal.toLocaleString()} goal</Text>

              {/* Progress bar */}
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(stepsData.percentage, 100)}%`,
                      backgroundColor: getStatusColor(stepsData.status),
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>{stepsData.percentage}%</Text>
              <Text style={styles.stepsMessage}>{stepsData.message}</Text>
            </View>
          ) : (
            <View style={styles.noVitalsContainer}>
              <Text style={styles.noDataText}>No steps tracked yet</Text>
              <Text style={styles.noDataHint}>
                Connect your phone or watch to start counting steps.
              </Text>
            </View>
          )}
        </View>

        {/* Medications Card */}
        <TouchableOpacity style={styles.card} onPress={onOpenMedications}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>
              {VITAL_TYPE_INFO.heart_rate ? '💊' : '💊'}
            </Text>
            <Text style={styles.cardTitle}>Medications</Text>
            <Text style={styles.cardAction}>View All {'>'}</Text>
          </View>
          <View style={styles.medContent}>
            <View style={styles.medStats}>
              <View style={styles.medStat}>
                <Text style={styles.medStatValue}>{medicationSchedule.taken}</Text>
                <Text style={styles.medStatLabel}>Taken</Text>
              </View>
              <View style={styles.medStatDivider} />
              <View style={styles.medStat}>
                <Text style={styles.medStatValue}>
                  {medicationSchedule.total - medicationSchedule.taken}
                </Text>
                <Text style={styles.medStatLabel}>Remaining</Text>
              </View>
            </View>
            {medicationSchedule.nextDose && (
              <View style={styles.nextDose}>
                <Text style={styles.nextDoseLabel}>Next dose:</Text>
                <Text style={styles.nextDoseText}>
                  {medicationSchedule.nextDose.name} at {medicationSchedule.nextDose.time}
                </Text>
              </View>
            )}
            {!medicationSchedule.nextDose && medicationSchedule.total > 0 && (
              <Text style={styles.allDoneText}>All medications taken for today!</Text>
            )}
            {medicationSchedule.total === 0 && (
              <>
                <Text style={styles.noDataText}>No medications yet</Text>
                <Text style={styles.noDataHint}>Tap here to add your medications.</Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* Vitals Grid */}
        <Text style={styles.sectionTitle}>Recent Vitals</Text>
        <View style={styles.vitalsGrid}>
          {vitalSummaries.length > 0 ? (
            vitalSummaries.map((summary) => {
              const inRange = isVitalInRange(summary);
              return (
                <View key={summary.type} style={styles.vitalCard}>
                  <Text style={styles.vitalIcon}>{summary.icon}</Text>
                  <Text style={styles.vitalName}>{summary.displayName}</Text>
                  {summary.latestReading && (
                    <>
                      <Text
                        style={[
                          styles.vitalValue,
                          inRange === false && styles.vitalValueWarning,
                          inRange === true && styles.vitalValueGood,
                        ]}
                      >
                        {summary.latestReading.value}
                        {summary.latestReading.secondaryValue &&
                          `/${summary.latestReading.secondaryValue}`}
                      </Text>
                      <Text style={styles.vitalUnit}>{summary.unit}</Text>
                      {summary.trend !== 'unknown' && (
                        <Text style={styles.vitalTrend}>{getTrendIcon(summary.trend)}</Text>
                      )}
                    </>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.noVitalsContainer}>
              <Text style={styles.noDataText}>No recent vital readings</Text>
              <Text style={styles.noDataHint}>
                Sync with your health app or add readings manually
              </Text>
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => healthDataService.syncFromHealthPlatform()}
          >
            <Text style={styles.actionIcon}>🔄</Text>
            <Text style={styles.actionText}>Sync Health Data</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onOpenMedications}>
            <Text style={styles.actionIcon}>➕</Text>
            <Text style={styles.actionText}>Log Medication</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={openVitalModal}
            accessibilityRole="button"
            accessibilityLabel="Log a vital reading"
          >
            <Text style={styles.actionIcon}>❤️</Text>
            <Text style={styles.actionText}>Log Vital Reading</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Manual vital-entry modal */}
      <Modal
        visible={vitalModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setVitalModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Log a Vital Reading</Text>

            <Text style={styles.modalLabel}>What are you recording?</Text>
            <View style={styles.vitalTypeRow}>
              {LOGGABLE_VITALS.map((opt) => (
                <TouchableOpacity
                  key={opt.type}
                  style={[styles.vitalTypeChip, vitalType === opt.type && styles.vitalTypeChipActive]}
                  onPress={() => setVitalType(opt.type)}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                >
                  <Text style={[styles.vitalTypeChipText, vitalType === opt.type && styles.vitalTypeChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>
              {currentVitalOption.secondary ? 'Systolic' : 'Reading'} ({currentVitalOption.unit})
            </Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              value={vitalValue}
              onChangeText={setVitalValue}
              placeholder={currentVitalOption.secondary ? 'e.g. 120' : 'Enter value'}
              accessibilityLabel="Vital reading value"
            />
            {currentVitalOption.secondary && (
              <>
                <Text style={styles.modalLabel}>Diastolic ({currentVitalOption.unit})</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  value={vitalSecondary}
                  onChangeText={setVitalSecondary}
                  placeholder="e.g. 80"
                  accessibilityLabel="Diastolic value"
                />
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setVitalModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSave, savingVital && styles.modalSaveDisabled]}
                onPress={saveVital}
                disabled={savingVital}
                accessibilityRole="button"
                accessibilityLabel="Save vital reading"
              >
                <Text style={styles.modalSaveText}>{savingVital ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: c.background,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: c.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
  },
  placeholder: {
    width: 50,
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
  loadingText: {
    fontSize: 16,
    color: c.textSecondary,
  },
  card: {
    backgroundColor: c.background,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
  },
  cardAction: {
    fontSize: 14,
    color: c.primary,
  },
  stepsContent: {
    alignItems: 'center',
  },
  stepsCount: {
    fontSize: 48,
    fontWeight: '700',
  },
  stepsGoal: {
    fontSize: 16,
    color: c.textSecondary,
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 12,
    backgroundColor: c.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: c.textSecondary,
    marginTop: 8,
  },
  stepsMessage: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  medContent: {
    alignItems: 'center',
  },
  medStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  medStat: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  medStatValue: {
    fontSize: 32,
    fontWeight: '700',
    color: c.text,
  },
  medStatLabel: {
    fontSize: 14,
    color: c.textSecondary,
  },
  medStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: c.border,
  },
  nextDose: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    width: '100%',
  },
  nextDoseLabel: {
    fontSize: 14,
    color: c.primary,
    marginBottom: 4,
  },
  nextDoseText: {
    fontSize: 16,
    fontWeight: '500',
    color: c.primaryDark,
  },
  allDoneText: {
    fontSize: 16,
    color: c.success,
    fontWeight: '500',
  },
  noDataText: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'center',
  },
  noDataHint: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: c.text,
    marginBottom: 12,
    marginTop: 8,
  },
  vitalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  vitalCard: {
    width: (width - 48) / 2,
    backgroundColor: c.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  vitalIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  vitalName: {
    fontSize: 14,
    color: c.textSecondary,
    marginBottom: 4,
  },
  vitalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: c.text,
  },
  vitalValueWarning: {
    color: c.warning,
  },
  vitalValueGood: {
    color: c.success,
  },
  vitalUnit: {
    fontSize: 14,
    color: c.textSecondary,
  },
  vitalTrend: {
    fontSize: 16,
    color: c.textSecondary,
    marginTop: 4,
  },
  noVitalsContainer: {
    width: '100%',
    backgroundColor: c.background,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: c.background,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    color: c.text,
    fontWeight: '500',
  },
  bottomPadding: {
    height: 40,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: c.text,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: c.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  vitalTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vitalTypeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: c.background,
    borderWidth: 1,
    borderColor: c.border,
  },
  vitalTypeChipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  vitalTypeChipText: {
    fontSize: 14,
    color: c.text,
  },
  vitalTypeChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 18,
    color: c.text,
    backgroundColor: c.background,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalCancel: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalCancelText: {
    fontSize: 16,
    color: c.text,
    fontWeight: '600',
  },
  modalSave: {
    backgroundColor: c.primary,
  },
  modalSaveDisabled: {
    opacity: 0.6,
  },
  modalSaveText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
});

export default HealthDashboard;
