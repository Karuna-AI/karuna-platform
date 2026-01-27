import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  getColors,
  getFontSizes,
  SPACING,
  TOUCH_TARGETS,
  announceForAccessibility,
} from '../utils/accessibility';
import { Contact, ContactSearchResult, contactsService } from '../services/contacts';
import { ConfirmationData } from '../services/intentActions';
import { ActionConfirmation } from '../types/actions';

interface IntentActionModalProps {
  visible: boolean;
  confirmationData: ConfirmationData | null;
  actionConfirmation?: ActionConfirmation | null;
  multipleContacts?: ContactSearchResult[];
  onSelectContact?: (contact: Contact) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onModify?: (field: string, value: string) => void;
  isLoading?: boolean;
}

export function IntentActionModal({
  visible,
  confirmationData,
  actionConfirmation,
  multipleContacts,
  onSelectContact,
  onConfirm,
  onCancel,
  onModify,
  isLoading = false,
}: IntentActionModalProps): JSX.Element | null {
  const colors = getColors(true);
  const fonts = getFontSizes('large');

  const [messageText, setMessageText] = useState('');
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);

  useEffect(() => {
    if (confirmationData?.messageContent) {
      setMessageText(confirmationData.messageContent);
    }
  }, [confirmationData]);

  useEffect(() => {
    if (visible && confirmationData) {
      announceForAccessibility(confirmationData.title);
    } else if (visible && actionConfirmation) {
      announceForAccessibility(actionConfirmation.title);
    }
  }, [visible, confirmationData, actionConfirmation]);

  // Handle new action confirmations (Phase 13)
  if (visible && actionConfirmation) {
    return renderActionConfirmation(
      actionConfirmation,
      colors,
      fonts,
      onConfirm,
      onCancel,
      isLoading
    );
  }

  if (!visible || !confirmationData) {
    return null;
  }

  // Render contact picker for multiple matches
  if (multipleContacts && multipleContacts.length > 1) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <Text
              style={[styles.modalTitle, { color: colors.text, fontSize: fonts.header }]}
            >
              {confirmationData.title}
            </Text>
            <Text
              style={[styles.modalDescription, { color: colors.textSecondary, fontSize: fonts.body }]}
            >
              {confirmationData.description}
            </Text>

            <FlatList
              data={multipleContacts}
              keyExtractor={(item) => item.contact.id}
              style={styles.contactList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.contactItem, { backgroundColor: colors.surface }]}
                  onPress={() => onSelectContact?.(item.contact)}
                  accessible={true}
                  accessibilityLabel={`Select ${item.contact.name}`}
                  accessibilityRole="button"
                >
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactName, { color: colors.text, fontSize: fonts.bodyLarge }]}>
                      {item.contact.name}
                    </Text>
                    <Text style={[styles.contactPhone, { color: colors.textSecondary, fontSize: fonts.body }]}>
                      {item.contact.phoneNumbers[0]}
                    </Text>
                  </View>
                  <View style={[styles.selectIcon, { backgroundColor: colors.primary }]}>
                    <Text style={styles.selectIconText}>→</Text>
                  </View>
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.surface }]}
              onPress={onCancel}
              accessible={true}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={[styles.cancelButtonText, { color: colors.error, fontSize: fonts.body }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Render call confirmation
  if (confirmationData.type === 'call') {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.iconText}>📞</Text>
            </View>

            <Text
              style={[styles.modalTitle, { color: colors.text, fontSize: fonts.headerLarge }]}
            >
              {confirmationData.title}
            </Text>

            {confirmationData.contact && (
              <View style={[styles.contactCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.contactCardName, { color: colors.text, fontSize: fonts.bodyLarge }]}>
                  {confirmationData.contact.name}
                </Text>
                <Text style={[styles.contactCardPhone, { color: colors.textSecondary, fontSize: fonts.body }]}>
                  {confirmationData.phoneNumber}
                </Text>
              </View>
            )}

            <Text
              style={[styles.modalDescription, { color: colors.textSecondary, fontSize: fonts.body }]}
            >
              {confirmationData.description}
            </Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.noButton, { backgroundColor: colors.surface }]}
                onPress={onCancel}
                accessible={true}
                accessibilityLabel="No, cancel"
                accessibilityRole="button"
              >
                <Text style={[styles.noButtonText, { color: colors.error, fontSize: fonts.bodyLarge }]}>
                  No
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.yesButton, { backgroundColor: colors.primary }]}
                onPress={onConfirm}
                accessible={true}
                accessibilityLabel="Yes, make the call"
                accessibilityRole="button"
              >
                <Text style={[styles.yesButtonText, { fontSize: fonts.bodyLarge }]}>
                  Yes, Call
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // Render message confirmation
  if (confirmationData.type === 'message') {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
              <Text style={styles.iconText}>💬</Text>
            </View>

            <Text
              style={[styles.modalTitle, { color: colors.text, fontSize: fonts.headerLarge }]}
            >
              {confirmationData.title}
            </Text>

            {confirmationData.contact && (
              <View style={[styles.contactCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.contactCardName, { color: colors.text, fontSize: fonts.bodyLarge }]}>
                  {confirmationData.contact.name}
                </Text>
                <Text style={[styles.contactCardPhone, { color: colors.textSecondary, fontSize: fonts.body }]}>
                  {confirmationData.phoneNumber}
                </Text>
              </View>
            )}

            <Text
              style={[styles.inputLabel, { color: colors.text, fontSize: fonts.body }]}
            >
              Message (optional):
            </Text>
            <TextInput
              style={[
                styles.messageInput,
                {
                  backgroundColor: colors.surface,
                  color: colors.text,
                  fontSize: fonts.body,
                  borderColor: colors.primary,
                },
              ]}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type your message here..."
              placeholderTextColor={colors.textSecondary}
              multiline
              accessible={true}
              accessibilityLabel="Message content"
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.noButton, { backgroundColor: colors.surface }]}
                onPress={onCancel}
                accessible={true}
                accessibilityLabel="Cancel"
                accessibilityRole="button"
              >
                <Text style={[styles.noButtonText, { color: colors.error, fontSize: fonts.bodyLarge }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.yesButton, { backgroundColor: colors.primary }]}
                onPress={onConfirm}
                accessible={true}
                accessibilityLabel="Send message"
                accessibilityRole="button"
              >
                <Text style={[styles.yesButtonText, { fontSize: fonts.bodyLarge }]}>
                  Send
                </Text>
              </TouchableOpacity>
            </View>

            {/* WhatsApp option */}
            <TouchableOpacity
              style={[styles.whatsappButton, { backgroundColor: '#25D366' }]}
              onPress={() => {
                // Handle WhatsApp send
              }}
              accessible={true}
              accessibilityLabel="Send via WhatsApp"
              accessibilityRole="button"
            >
              <Text style={styles.whatsappButtonText}>
                Send via WhatsApp
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Render reminder confirmation
  if (confirmationData.type === 'reminder') {
    const quickTimes = [
      { label: 'In 15 min', minutes: 15 },
      { label: 'In 30 min', minutes: 30 },
      { label: 'In 1 hour', minutes: 60 },
      { label: 'In 2 hours', minutes: 120 },
    ];

    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onCancel}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                <Text style={styles.iconText}>⏰</Text>
              </View>

              <Text
                style={[styles.modalTitle, { color: colors.text, fontSize: fonts.headerLarge }]}
              >
                {confirmationData.title}
              </Text>

              <View style={[styles.reminderCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.reminderText, { color: colors.text, fontSize: fonts.bodyLarge }]}>
                  "{confirmationData.reminderMessage}"
                </Text>
                {confirmationData.reminderTime && (
                  <Text style={[styles.reminderTime, { color: colors.primary, fontSize: fonts.body }]}>
                    {confirmationData.reminderTime}
                  </Text>
                )}
              </View>

              {!confirmationData.reminderTime || confirmationData.reminderTime.includes('Not specified') ? (
                <>
                  <Text style={[styles.inputLabel, { color: colors.text, fontSize: fonts.body }]}>
                    When should I remind you?
                  </Text>
                  <View style={styles.quickTimeContainer}>
                    {quickTimes.map((qt) => (
                      <TouchableOpacity
                        key={qt.label}
                        style={[
                          styles.quickTimeButton,
                          {
                            backgroundColor:
                              selectedTime &&
                              Math.abs(selectedTime.getTime() - (Date.now() + qt.minutes * 60000)) < 60000
                                ? colors.primary
                                : colors.surface,
                          },
                        ]}
                        onPress={() => {
                          const time = new Date(Date.now() + qt.minutes * 60 * 1000);
                          setSelectedTime(time);
                        }}
                        accessible={true}
                        accessibilityLabel={qt.label}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.quickTimeText,
                            {
                              color:
                                selectedTime &&
                                Math.abs(selectedTime.getTime() - (Date.now() + qt.minutes * 60000)) < 60000
                                  ? '#FFFFFF'
                                  : colors.text,
                              fontSize: fonts.body,
                            },
                          ]}
                        >
                          {qt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.noButton, { backgroundColor: colors.surface }]}
                  onPress={onCancel}
                  accessible={true}
                  accessibilityLabel="Cancel"
                  accessibilityRole="button"
                >
                  <Text style={[styles.noButtonText, { color: colors.error, fontSize: fonts.bodyLarge }]}>
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.yesButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={onConfirm}
                  accessible={true}
                  accessibilityLabel="Set reminder"
                  accessibilityRole="button"
                >
                  <Text style={[styles.yesButtonText, { fontSize: fonts.bodyLarge }]}>
                    Set Reminder
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  }

  return null;
}

// Phase 13: Render action confirmations for rides, navigation, etc.
function renderActionConfirmation(
  confirmation: ActionConfirmation,
  colors: ReturnType<typeof getColors>,
  fonts: ReturnType<typeof getFontSizes>,
  onConfirm: () => void,
  onCancel: () => void,
  isLoading: boolean
): JSX.Element {
  const getActionIcon = (type: string): string => {
    switch (type) {
      case 'uber_ride':
      case 'ola_ride':
      case 'lyft_ride':
        return '🚗';
      case 'maps_navigate':
      case 'maps_search':
        return '🗺️';
      case 'youtube_search':
      case 'youtube_play':
        return '▶️';
      case 'spotify_play':
      case 'music_play':
        return '🎵';
      case 'otp_assist':
        return '🔢';
      case 'emergency_call':
        return '🚨';
      default:
        return confirmation.icon;
    }
  };

  const getConfirmButtonText = (type: string): string => {
    switch (type) {
      case 'uber_ride':
      case 'ola_ride':
      case 'lyft_ride':
        return 'Book Ride';
      case 'maps_navigate':
        return 'Start Navigation';
      case 'maps_search':
        return 'Open Maps';
      case 'youtube_search':
      case 'youtube_play':
        return 'Open YouTube';
      case 'spotify_play':
      case 'music_play':
        return 'Play Music';
      case 'otp_assist':
        return 'Read OTP';
      case 'emergency_call':
        return 'Call Now';
      default:
        return 'Confirm';
    }
  };

  const isEmergency = confirmation.type === 'emergency_call';

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent={true}
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: isEmergency ? colors.error : colors.primary },
            ]}
          >
            <Text style={styles.iconText}>{getActionIcon(confirmation.type)}</Text>
          </View>

          <Text
            style={[
              styles.modalTitle,
              { color: colors.text, fontSize: fonts.headerLarge },
            ]}
          >
            {confirmation.title}
          </Text>

          <Text
            style={[
              styles.modalDescription,
              { color: colors.textSecondary, fontSize: fonts.body },
            ]}
          >
            {confirmation.description}
          </Text>

          {/* Details section */}
          {confirmation.details && confirmation.details.length > 0 && (
            <View style={[styles.detailsCard, { backgroundColor: colors.surface }]}>
              {confirmation.details.map((detail, index) => (
                <View
                  key={index}
                  style={[
                    styles.detailRow,
                    index < (confirmation.details?.length || 0) - 1 && styles.detailRowBorder,
                  ]}
                >
                  {detail.icon && <Text style={styles.detailIcon}>{detail.icon}</Text>}
                  <View style={styles.detailContent}>
                    <Text
                      style={[
                        styles.detailLabel,
                        { color: colors.textSecondary, fontSize: fonts.bodySmall },
                      ]}
                    >
                      {detail.label}
                    </Text>
                    <Text
                      style={[
                        styles.detailValue,
                        { color: colors.text, fontSize: fonts.body },
                      ]}
                    >
                      {detail.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Warnings */}
          {confirmation.warnings && confirmation.warnings.length > 0 && (
            <View style={[styles.warningsContainer, { backgroundColor: colors.error + '20' }]}>
              {confirmation.warnings.map((warning, index) => (
                <Text
                  key={index}
                  style={[styles.warningText, { color: colors.error, fontSize: fonts.bodySmall }]}
                >
                  ⚠️ {warning}
                </Text>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.actionButton, styles.noButton, { backgroundColor: colors.surface }]}
              onPress={onCancel}
              disabled={isLoading}
              accessible={true}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text
                style={[styles.noButtonText, { color: colors.error, fontSize: fonts.bodyLarge }]}
              >
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.yesButton,
                { backgroundColor: isEmergency ? colors.error : colors.primary },
              ]}
              onPress={onConfirm}
              disabled={isLoading}
              accessible={true}
              accessibilityLabel={getConfirmButtonText(confirmation.type)}
              accessibilityRole="button"
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={[styles.yesButtonText, { fontSize: fonts.bodyLarge }]}>
                  {getConfirmButtonText(confirmation.type)}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Safety note for OTP */}
          {confirmation.type === 'otp_assist' && (
            <Text
              style={[styles.safetyNote, { color: colors.textSecondary, fontSize: fonts.bodySmall }]}
            >
              🔒 Your OTP will be read aloud and never stored
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  iconText: {
    fontSize: 40,
  },
  modalTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  modalDescription: {
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  contactCard: {
    width: '100%',
    padding: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  contactCardName: {
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  contactCardPhone: {
    fontWeight: '400',
  },
  reminderCard: {
    width: '100%',
    padding: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.md,
  },
  reminderText: {
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  reminderTime: {
    fontWeight: '600',
    textAlign: 'center',
  },
  inputLabel: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
    fontWeight: '500',
  },
  messageInput: {
    width: '100%',
    borderWidth: 2,
    borderRadius: 16,
    padding: SPACING.md,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  quickTimeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
    justifyContent: 'center',
  },
  quickTimeButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
  },
  quickTimeText: {
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
  },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGETS.comfortable,
  },
  noButton: {},
  yesButton: {},
  noButtonText: {
    fontWeight: '700',
  },
  yesButtonText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  whatsappButton: {
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGETS.comfortable,
    marginTop: SPACING.md,
  },
  whatsappButtonText: {
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: 16,
  },
  contactList: {
    width: '100%',
    maxHeight: 300,
    marginBottom: SPACING.md,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.sm,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontWeight: '600',
    marginBottom: 4,
  },
  contactPhone: {},
  selectIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectIconText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  cancelButton: {
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGETS.comfortable,
  },
  cancelButtonText: {
    fontWeight: '600',
  },
  // Phase 13: Action confirmation styles
  detailsCard: {
    width: '100%',
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailIcon: {
    fontSize: 20,
    marginRight: SPACING.sm,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontWeight: '600',
  },
  warningsContainer: {
    width: '100%',
    borderRadius: 12,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  warningText: {
    marginBottom: 4,
  },
  safetyNote: {
    textAlign: 'center',
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },
});

export default IntentActionModal;
