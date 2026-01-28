import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { CheckIn, CHECK_IN_TYPE_INFO } from '../types/proactive';
import { proactiveEngineService } from '../services/proactiveEngine';

const { width } = Dimensions.get('window');

interface CheckInCardProps {
  checkIn: CheckIn;
  onDismiss?: () => void;
  onRespond?: (followUp: string) => void;
}

export const CheckInCard: React.FC<CheckInCardProps> = ({
  checkIn,
  onDismiss,
  onRespond,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isResponding, setIsResponding] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState<string | null>(null);
  const slideAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();
  }, []);

  const typeInfo = CHECK_IN_TYPE_INFO[checkIn.type];

  const getPriorityColor = () => {
    switch (checkIn.priority) {
      case 'urgent':
        return '#dc2626';
      case 'high':
        return '#f59e0b';
      case 'medium':
        return '#3b82f6';
      default:
        return '#6b7280';
    }
  };

  const handleAction = useCallback(async (actionId: string) => {
    setIsResponding(true);
    try {
      const result = await proactiveEngineService.respondToCheckIn(checkIn.id, actionId);
      if (result.success && result.followUp) {
        setFollowUpMessage(result.followUp);
        onRespond?.(result.followUp);
      }

      // Animate out after brief delay
      setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          onDismiss?.();
        });
      }, 2000);
    } catch (error) {
      console.error('[CheckInCard] Response error:', error);
    } finally {
      setIsResponding(false);
    }
  }, [checkIn.id, onDismiss, onRespond]);

  const handleSnooze = useCallback(async () => {
    await proactiveEngineService.snoozeCheckIn(checkIn.id, 30);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss?.();
    });
  }, [checkIn.id, onDismiss]);

  const handleDismiss = useCallback(async () => {
    await proactiveEngineService.dismissCheckIn(checkIn.id);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss?.();
    });
  }, [checkIn.id, onDismiss]);

  if (followUpMessage) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            transform: [
              {
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-100, 0],
                }),
              },
            ],
            opacity: slideAnim,
          },
        ]}
      >
        <View style={[styles.card, styles.followUpCard]}>
          <Text style={styles.followUpIcon}>✓</Text>
          <Text style={styles.followUpText}>{followUpMessage}</Text>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-100, 0],
              }),
            },
          ],
          opacity: slideAnim,
        },
      ]}
    >
      <View style={[styles.card, { borderLeftColor: getPriorityColor() }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.icon}>{typeInfo?.icon || '💬'}</Text>
            <View>
              <Text style={styles.title}>{checkIn.title}</Text>
              {checkIn.priority === 'urgent' && (
                <Text style={[styles.priorityBadge, { backgroundColor: getPriorityColor() }]}>
                  Important
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={handleDismiss}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.dismissText}>x</Text>
          </TouchableOpacity>
        </View>

        {/* Message */}
        <Text style={styles.message}>{checkIn.message}</Text>

        {/* Suggestion */}
        {checkIn.suggestion && (
          <Text style={styles.suggestion}>{checkIn.suggestion}</Text>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {checkIn.actions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[
                styles.actionButton,
                action.type === 'positive' && styles.actionButtonPositive,
                action.type === 'negative' && styles.actionButtonNegative,
                action.type === 'call_caregiver' && styles.actionButtonCall,
              ]}
              onPress={() => handleAction(action.id)}
              disabled={isResponding}
            >
              {action.icon && <Text style={styles.actionIcon}>{action.icon}</Text>}
              <Text
                style={[
                  styles.actionText,
                  action.type === 'positive' && styles.actionTextPositive,
                  action.type === 'call_caregiver' && styles.actionTextCall,
                ]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Snooze option */}
        <TouchableOpacity style={styles.snoozeButton} onPress={handleSnooze}>
          <Text style={styles.snoozeText}>Remind me later</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

interface CheckInOverlayProps {
  visible: boolean;
  checkIn: CheckIn | null;
  onDismiss: () => void;
  onRespond?: (followUp: string) => void;
}

export const CheckInOverlay: React.FC<CheckInOverlayProps> = ({
  visible,
  checkIn,
  onDismiss,
  onRespond,
}) => {
  if (!checkIn) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <CheckInCard
          checkIn={checkIn}
          onDismiss={onDismiss}
          onRespond={onRespond}
        />
      </View>
    </Modal>
  );
};

interface CheckInBannerProps {
  checkIns: CheckIn[];
  onTap?: () => void;
}

export const CheckInBanner: React.FC<CheckInBannerProps> = ({
  checkIns,
  onTap,
}) => {
  if (checkIns.length === 0) return null;

  const latestCheckIn = checkIns[0];
  const typeInfo = CHECK_IN_TYPE_INFO[latestCheckIn.type];

  return (
    <TouchableOpacity style={styles.banner} onPress={onTap}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerIcon}>{typeInfo?.icon || '💬'}</Text>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle}>{latestCheckIn.title}</Text>
          <Text style={styles.bannerMessage} numberOfLines={1}>
            {latestCheckIn.message}
          </Text>
        </View>
        {checkIns.length > 1 && (
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>{checkIns.length}</Text>
          </View>
        )}
      </View>
      <Text style={styles.bannerChevron}>{'>'}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: width - 32,
    alignSelf: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  followUpCard: {
    backgroundColor: '#ecfdf5',
    borderLeftColor: '#22c55e',
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 16,
  },
  followUpIcon: {
    fontSize: 24,
    color: '#22c55e',
    marginRight: 12,
  },
  followUpText: {
    fontSize: 16,
    color: '#166534',
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 32,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  priorityBadge: {
    fontSize: 10,
    color: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  dismissButton: {
    padding: 4,
  },
  dismissText: {
    fontSize: 20,
    color: '#9ca3af',
    fontWeight: '300',
  },
  message: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
    marginBottom: 12,
  },
  suggestion: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    minWidth: 80,
    justifyContent: 'center',
  },
  actionButtonPositive: {
    backgroundColor: '#dcfce7',
  },
  actionButtonNegative: {
    backgroundColor: '#fef2f2',
  },
  actionButtonCall: {
    backgroundColor: '#dbeafe',
  },
  actionIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  actionTextPositive: {
    color: '#166534',
  },
  actionTextCall: {
    color: '#1d4ed8',
  },
  snoozeButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  snoozeText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bannerIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  bannerText: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  bannerMessage: {
    fontSize: 13,
    color: '#6b7280',
  },
  bannerBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  bannerBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  bannerChevron: {
    fontSize: 18,
    color: '#9ca3af',
    marginLeft: 8,
  },
});

export default CheckInCard;
