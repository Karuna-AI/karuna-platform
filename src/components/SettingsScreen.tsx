import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Switch,
  Alert,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import {
  useSettings,
  FontSize,
  SpeechRate,
  Language,
  EmergencyContact,
} from '../context/SettingsContext';
import { useTranslation } from '../i18n/useTranslation';
import { getLanguageConfig } from '../i18n/languages';
import { LanguageSelector } from './LanguageSelector';
import { SPACING, TOUCH_TARGETS } from '../utils/accessibility';

interface SettingsScreenProps {
  onClose: () => void;
  onOpenSecurity?: () => void;
  onOpenProactive?: () => void;
}

interface OptionButtonProps<T> {
  value: T;
  currentValue: T;
  label: string;
  onSelect: (value: T) => void;
  fontSize: number;
}

function OptionButton<T>({
  value,
  currentValue,
  label,
  onSelect,
  fontSize,
}: OptionButtonProps<T>): JSX.Element {
  const isSelected = value === currentValue;
  return (
    <TouchableOpacity
      style={[
        styles.optionButton,
        isSelected && styles.optionButtonSelected,
      ]}
      onPress={() => onSelect(value)}
      accessible={true}
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      accessibilityRole="button"
    >
      <Text
        style={[
          styles.optionButtonText,
          { fontSize },
          isSelected && styles.optionButtonTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function SettingsScreen({ onClose, onOpenSecurity, onOpenProactive }: SettingsScreenProps): JSX.Element {
  const { t } = useTranslation();
  const {
    settings,
    setFontSize,
    setSpeechRate,
    setLanguage,
    setTtsEnabled,
    setAutoPlayResponses,
    setHapticFeedback,
    setHighContrast,
    addEmergencyContact,
    removeEmergencyContact,
    updateEmergencyContact,
    setPrimaryEmergencyContact,
    getPrimaryEmergencyContact,
    resetToDefaults,
  } = useSettings();

  const [showAddContact, setShowAddContact] = useState(false);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactRelationship, setContactRelationship] = useState('');

  // Font size based on settings
  const getFontSize = (base: number): number => {
    const multipliers: Record<FontSize, number> = {
      small: 0.85,
      medium: 1,
      large: 1.15,
      extraLarge: 1.35,
    };
    return Math.round(base * multipliers[settings.fontSize]);
  };

  const bodyFont = getFontSize(16);
  const headerFont = getFontSize(20);
  const sectionFont = getFontSize(14);

  const handleResetSettings = useCallback(() => {
    Alert.alert(
      t.settings.resetConfirmTitle,
      t.settings.resetConfirmMessage,
      [
        { text: t.cancel, style: 'cancel' },
        { text: t.confirm, style: 'destructive', onPress: resetToDefaults },
      ]
    );
  }, [t, resetToDefaults]);

  const handleAddContact = useCallback(() => {
    setContactName('');
    setContactPhone('');
    setContactRelationship('');
    setEditingContact(null);
    setShowAddContact(true);
  }, []);

  const handleEditContact = useCallback((contact: EmergencyContact) => {
    setContactName(contact.name);
    setContactPhone(contact.phoneNumber);
    setContactRelationship(contact.relationship || '');
    setEditingContact(contact);
    setShowAddContact(true);
  }, []);

  const handleSaveContact = useCallback(() => {
    if (!contactName.trim() || !contactPhone.trim()) {
      Alert.alert(t.error, 'Please enter name and phone number');
      return;
    }

    if (editingContact) {
      updateEmergencyContact(editingContact.id, {
        name: contactName.trim(),
        phoneNumber: contactPhone.trim(),
        relationship: contactRelationship.trim() || undefined,
      });
    } else {
      addEmergencyContact({
        name: contactName.trim(),
        phoneNumber: contactPhone.trim(),
        relationship: contactRelationship.trim() || undefined,
      });
    }

    setShowAddContact(false);
  }, [contactName, contactPhone, contactRelationship, editingContact, addEmergencyContact, updateEmergencyContact, t]);

  const handleDeleteContact = useCallback((contact: EmergencyContact) => {
    Alert.alert(
      t.delete,
      `Remove ${contact.name} from emergency contacts?`,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.delete,
          style: 'destructive',
          onPress: () => removeEmergencyContact(contact.id),
        },
      ]
    );
  }, [t, removeEmergencyContact]);

  const handleEmergencyCall = useCallback(() => {
    const primary = getPrimaryEmergencyContact();
    if (!primary) {
      Alert.alert(t.emergency.noContacts, t.emergency.noContactsHint);
      return;
    }

    const message = t.emergency.callConfirmMessage.replace('{name}', primary.name);
    Alert.alert(t.emergency.callConfirmTitle, message, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.emergency.callButton,
        style: 'destructive',
        onPress: () => {
          const url = `tel:${primary.phoneNumber.replace(/\s/g, '')}`;
          Linking.openURL(url).catch(() => {
            Alert.alert(t.error, 'Could not make call');
          });
        },
      },
    ]);
  }, [t, getPrimaryEmergencyContact]);

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { fontSize: sectionFont }]}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  const renderToggle = (
    label: string,
    value: boolean,
    onValueChange: (value: boolean) => void
  ) => (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { fontSize: bodyFont }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#767577', true: '#4CAF50' }}
        thumbColor={value ? '#FFFFFF' : '#f4f3f4'}
        ios_backgroundColor="#767577"
        accessible={true}
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
      />
    </View>
  );

  const renderContactModal = () => (
    <Modal
      visible={showAddContact}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowAddContact(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={[styles.modalTitle, { fontSize: headerFont }]}>
            {editingContact ? t.emergency.editContact : t.emergency.addContact}
          </Text>

          <Text style={[styles.inputLabel, { fontSize: sectionFont }]}>
            {t.emergency.contactName}
          </Text>
          <TextInput
            style={[styles.input, { fontSize: bodyFont }]}
            value={contactName}
            onChangeText={setContactName}
            placeholder="Name"
            autoFocus
          />

          <Text style={[styles.inputLabel, { fontSize: sectionFont }]}>
            {t.emergency.contactPhone}
          </Text>
          <TextInput
            style={[styles.input, { fontSize: bodyFont }]}
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="+1234567890"
            keyboardType="phone-pad"
          />

          <Text style={[styles.inputLabel, { fontSize: sectionFont }]}>
            {t.emergency.contactRelationship}
          </Text>
          <TextInput
            style={[styles.input, { fontSize: bodyFont }]}
            value={contactRelationship}
            onChangeText={setContactRelationship}
            placeholder="Son, Daughter, Doctor, etc."
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setShowAddContact(false)}
            >
              <Text style={[styles.modalButtonText, { fontSize: bodyFont }]}>
                {t.cancel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalButton, styles.saveButton]}
              onPress={handleSaveContact}
            >
              <Text style={[styles.modalButtonTextWhite, { fontSize: bodyFont }]}>
                {t.save}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onClose}
          accessible={true}
          accessibilityLabel={t.back}
          accessibilityRole="button"
        >
          <Text style={[styles.backButtonText, { fontSize: bodyFont }]}>
            {t.back}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: headerFont }]}>
          {t.settings.title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Emergency Call Button - Big and prominent */}
        <TouchableOpacity
          style={styles.emergencyButton}
          onPress={handleEmergencyCall}
          accessible={true}
          accessibilityLabel={t.emergency.callButton}
          accessibilityRole="button"
        >
          <Text style={styles.emergencyButtonText}>{t.emergency.callButton}</Text>
          {getPrimaryEmergencyContact() && (
            <Text style={styles.emergencyContactName}>
              {getPrimaryEmergencyContact()?.name}
            </Text>
          )}
        </TouchableOpacity>

        {/* Font Size */}
        {renderSection(t.settings.fontSize, (
          <View style={styles.optionsRow}>
            <OptionButton
              value="small"
              currentValue={settings.fontSize}
              label={t.settings.fontSizeSmall}
              onSelect={setFontSize}
              fontSize={14}
            />
            <OptionButton
              value="medium"
              currentValue={settings.fontSize}
              label={t.settings.fontSizeMedium}
              onSelect={setFontSize}
              fontSize={16}
            />
            <OptionButton
              value="large"
              currentValue={settings.fontSize}
              label={t.settings.fontSizeLarge}
              onSelect={setFontSize}
              fontSize={18}
            />
            <OptionButton
              value="extraLarge"
              currentValue={settings.fontSize}
              label={t.settings.fontSizeExtraLarge}
              onSelect={setFontSize}
              fontSize={20}
            />
          </View>
        ))}

        {/* Speech Rate */}
        {renderSection(t.settings.speechRate, (
          <View style={styles.optionsRow}>
            <OptionButton
              value={0.7 as SpeechRate}
              currentValue={settings.speechRate}
              label={t.settings.speechRateSlow}
              onSelect={setSpeechRate}
              fontSize={bodyFont}
            />
            <OptionButton
              value={0.8 as SpeechRate}
              currentValue={settings.speechRate}
              label={t.settings.speechRateNormal}
              onSelect={setSpeechRate}
              fontSize={bodyFont}
            />
            <OptionButton
              value={0.9 as SpeechRate}
              currentValue={settings.speechRate}
              label={t.settings.speechRateFast}
              onSelect={setSpeechRate}
              fontSize={bodyFont}
            />
            <OptionButton
              value={1.0 as SpeechRate}
              currentValue={settings.speechRate}
              label={t.settings.speechRateFaster}
              onSelect={setSpeechRate}
              fontSize={bodyFont}
            />
          </View>
        ))}

        {/* Language */}
        {renderSection(t.settings.language, (
          <TouchableOpacity
            style={styles.languageButton}
            onPress={() => setShowLanguageSelector(true)}
            accessible={true}
            accessibilityLabel={`Current language: ${getLanguageConfig(settings.language).name}. Tap to change.`}
            accessibilityRole="button"
          >
            <View style={styles.languageButtonContent}>
              <Text style={[styles.languageNativeName, { fontSize: bodyFont }]}>
                {getLanguageConfig(settings.language).nativeName}
              </Text>
              <Text style={[styles.languageEnglishName, { fontSize: sectionFont }]}>
                {getLanguageConfig(settings.language).name}
              </Text>
            </View>
            <Text style={styles.languageButtonArrow}>→</Text>
          </TouchableOpacity>
        ))}

        {/* Voice Settings */}
        {renderSection(t.settings.voice, (
          <>
            {renderToggle(t.settings.autoPlayResponses, settings.autoPlayResponses, setAutoPlayResponses)}
          </>
        ))}

        {/* Accessibility */}
        {renderSection(t.settings.accessibility, (
          <>
            {renderToggle(t.settings.highContrast, settings.highContrast, setHighContrast)}
            {renderToggle(t.settings.hapticFeedback, settings.hapticFeedback, setHapticFeedback)}
          </>
        ))}

        {/* Emergency Contacts */}
        {renderSection(t.emergency.title, (
          <View>
            {settings.emergencyContacts.map((contact) => (
              <View key={contact.id} style={styles.contactRow}>
                <TouchableOpacity
                  style={styles.contactInfo}
                  onPress={() => handleEditContact(contact)}
                >
                  <Text style={[styles.contactName, { fontSize: bodyFont }]}>
                    {contact.name}
                    {contact.id === settings.primaryEmergencyContact && (
                      <Text style={styles.primaryBadge}> ({t.emergency.primaryContact})</Text>
                    )}
                  </Text>
                  <Text style={[styles.contactPhone, { fontSize: sectionFont }]}>
                    {contact.phoneNumber}
                  </Text>
                </TouchableOpacity>
                <View style={styles.contactActions}>
                  {contact.id !== settings.primaryEmergencyContact && (
                    <TouchableOpacity
                      style={styles.contactAction}
                      onPress={() => setPrimaryEmergencyContact(contact.id)}
                    >
                      <Text style={[styles.contactActionText, { fontSize: sectionFont }]}>
                        {t.emergency.setPrimary}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.contactAction, styles.deleteAction]}
                    onPress={() => handleDeleteContact(contact)}
                  >
                    <Text style={[styles.deleteActionText, { fontSize: sectionFont }]}>
                      {t.delete}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {settings.emergencyContacts.length === 0 && (
              <Text style={[styles.noContactsText, { fontSize: bodyFont }]}>
                {t.emergency.noContactsHint}
              </Text>
            )}

            <TouchableOpacity
              style={styles.addContactButton}
              onPress={handleAddContact}
            >
              <Text style={[styles.addContactButtonText, { fontSize: bodyFont }]}>
                + {t.emergency.addContact}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Security & Privacy */}
        {onOpenSecurity && (
          <TouchableOpacity
            style={styles.securityButton}
            onPress={onOpenSecurity}
            accessible={true}
            accessibilityLabel="Open Security and Privacy Settings"
            accessibilityRole="button"
          >
            <View style={styles.securityButtonContent}>
              <Text style={styles.securityIcon}>🔐</Text>
              <View style={styles.securityInfo}>
                <Text style={[styles.securityTitle, { fontSize: bodyFont }]}>
                  Security & Privacy
                </Text>
                <Text style={[styles.securityDescription, { fontSize: sectionFont }]}>
                  PIN, biometrics, data consent, activity log
                </Text>
              </View>
            </View>
            <Text style={styles.securityArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Proactive Check-Ins */}
        {onOpenProactive && (
          <TouchableOpacity
            style={styles.securityButton}
            onPress={onOpenProactive}
            accessible={true}
            accessibilityLabel="Open Check-In Settings"
            accessibilityRole="button"
          >
            <View style={styles.securityButtonContent}>
              <Text style={styles.securityIcon}>💬</Text>
              <View style={styles.securityInfo}>
                <Text style={[styles.securityTitle, { fontSize: bodyFont }]}>
                  Check-In Settings
                </Text>
                <Text style={[styles.securityDescription, { fontSize: sectionFont }]}>
                  Reminders, nudges, quiet hours
                </Text>
              </View>
            </View>
            <Text style={styles.securityArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Reset */}
        <TouchableOpacity
          style={styles.resetButton}
          onPress={handleResetSettings}
        >
          <Text style={[styles.resetButtonText, { fontSize: bodyFont }]}>
            {t.settings.resetToDefaults}
          </Text>
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {renderContactModal()}

      {/* Language Selector Modal */}
      <LanguageSelector
        visible={showLanguageSelector}
        currentLanguage={settings.language}
        onSelect={setLanguage}
        onClose={() => setShowLanguageSelector(false)}
        fontSize={bodyFont}
      />
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
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    paddingVertical: SPACING.sm,
    paddingRight: SPACING.md,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#1976D2',
    fontWeight: '600',
  },
  headerTitle: {
    fontWeight: '700',
    color: '#212121',
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  emergencyButton: {
    backgroundColor: '#D32F2F',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    paddingVertical: SPACING.xl,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  emergencyButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  emergencyContactName: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    marginTop: SPACING.xs,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    color: '#757575',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  optionButton: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 24,
    backgroundColor: '#F5F5F5',
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
  },
  optionButtonText: {
    color: '#616161',
    fontWeight: '500',
  },
  optionButtonTextSelected: {
    color: '#1976D2',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    minHeight: TOUCH_TARGETS.comfortable,
  },
  toggleLabel: {
    color: '#212121',
    flex: 1,
    paddingRight: SPACING.md,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    minHeight: TOUCH_TARGETS.comfortable,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },
  languageButtonContent: {
    flex: 1,
  },
  languageNativeName: {
    color: '#212121',
    fontWeight: '600',
  },
  languageEnglishName: {
    color: '#757575',
    marginTop: 2,
  },
  languageButtonArrow: {
    fontSize: 20,
    color: '#1976D2',
    marginLeft: SPACING.sm,
  },
  contactRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  contactInfo: {
    paddingVertical: SPACING.xs,
  },
  contactName: {
    color: '#212121',
    fontWeight: '600',
  },
  primaryBadge: {
    color: '#4CAF50',
    fontWeight: '500',
  },
  contactPhone: {
    color: '#757575',
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  contactAction: {
    paddingVertical: SPACING.xs,
  },
  contactActionText: {
    color: '#1976D2',
    fontWeight: '500',
  },
  deleteAction: {},
  deleteActionText: {
    color: '#D32F2F',
    fontWeight: '500',
  },
  noContactsText: {
    color: '#757575',
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  addContactButton: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.comfortable,
    justifyContent: 'center',
  },
  addContactButtonText: {
    color: '#1976D2',
    fontWeight: '600',
  },
  securityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4A90A4',
  },
  securityButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  securityIcon: {
    fontSize: 28,
    marginRight: SPACING.md,
  },
  securityInfo: {
    flex: 1,
  },
  securityTitle: {
    color: '#212121',
    fontWeight: '700',
    marginBottom: 2,
  },
  securityDescription: {
    color: '#757575',
  },
  securityArrow: {
    fontSize: 20,
    color: '#4A90A4',
    marginLeft: SPACING.sm,
  },
  resetButton: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.comfortable,
    justifyContent: 'center',
  },
  resetButtonText: {
    color: '#D32F2F',
    fontWeight: '500',
  },
  bottomPadding: {
    height: SPACING.xl * 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: SPACING.lg,
  },
  modalTitle: {
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    color: '#757575',
    marginBottom: SPACING.xs,
    marginTop: SPACING.sm,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: '#212121',
    minHeight: TOUCH_TARGETS.comfortable,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: TOUCH_TARGETS.comfortable,
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F5F5',
  },
  saveButton: {
    backgroundColor: '#1976D2',
  },
  modalButtonText: {
    color: '#616161',
    fontWeight: '600',
  },
  modalButtonTextWhite: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default SettingsScreen;
