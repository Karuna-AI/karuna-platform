import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  FlatList,
  Platform,
} from 'react-native';
import { auditLogService, AuditLogEntry, AuditCategory } from '../services/auditLog';

interface AuditLogScreenProps {
  onBack: () => void;
}

type FilterType = 'all' | AuditCategory;

const CATEGORY_FILTERS: { value: FilterType; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: '📋' },
  { value: 'security', label: 'Security', icon: '🔐' },
  { value: 'vault', label: 'Vault', icon: '🗄️' },
  { value: 'consent', label: 'Consent', icon: '✅' },
  { value: 'caregiver', label: 'Caregiver', icon: '👨‍👩‍👧' },
];

export default function AuditLogScreen({ onBack }: AuditLogScreenProps): JSX.Element {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [summary, setSummary] = useState(auditLogService.getActivitySummary());

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = () => {
    if (filter === 'all') {
      setLogs(auditLogService.getLogs({ limit: 100 }));
    } else {
      setLogs(auditLogService.getLogs({ category: filter, limit: 100 }));
    }
    setSummary(auditLogService.getActivitySummary());
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  const getActionIcon = (action: string): string => {
    if (action.includes('auth')) return '🔑';
    if (action.includes('pin')) return '🔢';
    if (action.includes('biometric')) return '👆';
    if (action.includes('lock')) return '🔒';
    if (action.includes('vault')) return '🗄️';
    if (action.includes('consent')) return '✅';
    if (action.includes('caregiver')) return '👥';
    if (action.includes('data')) return '📊';
    if (action.includes('secure')) return '🔐';
    return '📝';
  };

  const getActionColor = (action: string): string => {
    if (action.includes('failed')) return '#F44336';
    if (action.includes('revoked') || action.includes('deleted') || action.includes('removed')) return '#FF9800';
    if (action.includes('success') || action.includes('granted') || action.includes('enabled')) return '#4CAF50';
    return '#666';
  };

  const renderLogItem = ({ item }: { item: AuditLogEntry }) => (
    <View style={styles.logItem}>
      <View style={styles.logIcon}>
        <Text style={styles.logIconText}>{getActionIcon(item.action)}</Text>
      </View>
      <View style={styles.logContent}>
        <Text style={styles.logDescription}>{item.description}</Text>
        <View style={styles.logMeta}>
          <Text style={[styles.logAction, { color: getActionColor(item.action) }]}>
            {item.action.replace(/_/g, ' ')}
          </Text>
          <Text style={styles.logTime}>{formatTimestamp(item.timestamp)}</Text>
        </View>
        {item.userName && (
          <Text style={styles.logUser}>by {item.userName}</Text>
        )}
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No Activity Yet</Text>
      <Text style={styles.emptyDescription}>
        Your activity history will appear here
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Activity Log</Text>
      </View>

      {/* Summary Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryScroll}>
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, { backgroundColor: '#E3F2FD' }]}>
            <Text style={styles.summaryNumber}>{summary.totalEntries}</Text>
            <Text style={styles.summaryLabel}>Total Events</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#FFF3E0' }]}>
            <Text style={styles.summaryNumber}>{summary.securityEvents}</Text>
            <Text style={styles.summaryLabel}>Security</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#E8F5E9' }]}>
            <Text style={styles.summaryNumber}>{summary.vaultAccess}</Text>
            <Text style={styles.summaryLabel}>Vault Access</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: '#FCE4EC' }]}>
            <Text style={styles.summaryNumber}>{summary.caregiverActivity}</Text>
            <Text style={styles.summaryLabel}>Caregiver</Text>
          </View>
        </View>
      </ScrollView>

      {/* Filter Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={styles.filterContainer}>
          {CATEGORY_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterTab, filter === f.value && styles.filterTabActive]}
              onPress={() => setFilter(f.value)}
            >
              <Text style={styles.filterIcon}>{f.icon}</Text>
              <Text
                style={[
                  styles.filterLabel,
                  filter === f.value && styles.filterLabelActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Log List */}
      <FlatList
        data={logs}
        renderItem={renderLogItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.logList}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />

      {/* Last Events */}
      {summary.lastSecurityEvent && (
        <View style={styles.lastEventBar}>
          <Text style={styles.lastEventText}>
            🔐 Last security event: {formatTimestamp(summary.lastSecurityEvent.timestamp)}
          </Text>
        </View>
      )}
    </SafeAreaView>
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
  summaryScroll: {
    maxHeight: 100,
    backgroundColor: '#fff',
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: 16,
    paddingRight: 8,
  },
  summaryCard: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginRight: 12,
    minWidth: 90,
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  filterScroll: {
    maxHeight: 56,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 8,
    paddingHorizontal: 12,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  filterTabActive: {
    backgroundColor: '#4A90A4',
  },
  filterIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  filterLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterLabelActive: {
    color: '#fff',
  },
  logList: {
    padding: 16,
    paddingBottom: 80,
  },
  logItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    ...Platform.select({
      web: { boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  logIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logIconText: {
    fontSize: 18,
  },
  logContent: {
    flex: 1,
  },
  logDescription: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    marginBottom: 4,
  },
  logMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logAction: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  logTime: {
    fontSize: 12,
    color: '#999',
  },
  logUser: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#666',
  },
  lastEventBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  lastEventText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
