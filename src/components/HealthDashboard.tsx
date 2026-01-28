import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { healthDataService } from '../services/healthData';
import { medicationService } from '../services/medication';
import { VitalType, VITAL_TYPE_INFO, VitalSummary } from '../types/health';

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
        return '#22c55e';
      case 'met':
        return '#3b82f6';
      case 'near':
        return '#f59e0b';
      default:
        return '#6b7280';
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
            <Text style={styles.noDataText}>No step data available</Text>
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
              <Text style={styles.noDataText}>No medications scheduled</Text>
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
    padding: 16,
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
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    color: '#1f2937',
  },
  cardAction: {
    fontSize: 14,
    color: '#3b82f6',
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
    color: '#6b7280',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 12,
    backgroundColor: '#e5e7eb',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  stepsMessage: {
    fontSize: 14,
    color: '#6b7280',
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
    color: '#1f2937',
  },
  medStatLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  medStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e5e7eb',
  },
  nextDose: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    width: '100%',
  },
  nextDoseLabel: {
    fontSize: 12,
    color: '#3b82f6',
    marginBottom: 4,
  },
  nextDoseText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1e40af',
  },
  allDoneText: {
    fontSize: 16,
    color: '#22c55e',
    fontWeight: '500',
  },
  noDataText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  noDataHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
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
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  vitalIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  vitalName: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  vitalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  vitalValueWarning: {
    color: '#f59e0b',
  },
  vitalValueGood: {
    color: '#22c55e',
  },
  vitalUnit: {
    fontSize: 12,
    color: '#9ca3af',
  },
  vitalTrend: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
  noVitalsContainer: {
    width: '100%',
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  bottomPadding: {
    height: 40,
  },
});

export default HealthDashboard;
