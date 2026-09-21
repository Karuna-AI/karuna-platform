import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  StatusBar,
  Text,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  BackHandler,
  ToastAndroid,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useChatContext } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { Message } from '../types';
import { VoiceButton } from './VoiceButton';
import { ChatBubble } from './ChatBubble';
import { LoadingIndicator } from './LoadingIndicator';
import { WeatherWidget } from './WeatherWidget';
import { useVoicePreferences } from './voicePreferences';
import { getCurrentTranslations } from '../i18n/translations';
import { ttsService } from '../services/tts';
import { onApiProgress } from '../services/api';
import {
  getFontSizes,
  SPACING,
  TOUCH_TARGETS,
  announceForAccessibility} from '../utils/accessibility';

/** #12: auto-send undo window before a voice transcript is sent. */
const AUTO_SEND_UNDO_MS = 5000;

interface ChatScreenProps {
  onOpenSettings?: () => void;
  onOpenVault?: () => void;
  onOpenCareCircle?: () => void;
  onOpenHealth?: () => void;
}

export function ChatScreen({ onOpenSettings, onOpenVault, onOpenCareCircle, onOpenHealth }: ChatScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const fonts = getFontSizes('large');
  const t = getCurrentTranslations();
  // #1/#12: tap-to-talk default + opt-in review-before-send.
  const { tapToTalk, confirmVoiceMessage } = useVoicePreferences();

  // "Press back again to exit" — elderly users frequently double-tap back by
  // accident; one press would otherwise quit the app from the root route.
  // First press: show a toast, arm the exit flag for 2 seconds. Second press
  // within that window: allow default behavior (exit). After the window, reset.
  const backPressedRecentlyRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backPressedRecentlyRef.current) {
        return false; // second press within window → let the system exit
      }
      backPressedRecentlyRef.current = true;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      setTimeout(() => { backPressedRecentlyRef.current = false; }, 2000);
      return true; // block the first press
    });
    return () => handler.remove();
  }, []);

  const {
    messages,
    isLoading,
    isLoadingHistory,
    isRecording,
    isProcessing,
    isSpeaking,
    error,
    recordingDuration,
    pendingTranscript,
    isPendingTranscriptVisible,
    permissionBlocked,
    startRecording,
    stopRecordingForEdit,
    cancelRecording,
    stopSpeaking,
    clearMessages,
    sendMessage,
    confirmTranscript,
    editTranscript,
    dismissTranscript,
    openSettings,
    clearError,
  } = useChatContext();

  const flatListRef = useRef<FlatList>(null);
  const textInputRef = useRef<TextInput>(null);
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');

  // #12: auto-send undo state. When review-before-send is OFF, a fresh
  // transcript skips the modal and sends after a short undo window.
  const [undoVisible, setUndoVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  // #30: surface TTS engine failures in the chat UI (friendly translated
  // message from the service). TTS can't speak its own error, so we show it.
  const [ttsError, setTtsError] = useState<string | null>(null);
  useEffect(() => {
    const unsubscribe = ttsService.onSpeakError((message) => {
      setTtsError(message);
      announceForAccessibility(message);
    });
    return unsubscribe;
  }, []);

  // #40: visible "Still working…" feedback when a request runs long. The API
  // service notifies subscribers; we show it while loading/processing.
  const [apiProgress, setApiProgress] = useState<string | null>(null);
  useEffect(() => {
    const unsubscribe = onApiProgress((message) => {
      setApiProgress(message);
      announceForAccessibility(message);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    if (!isLoading && !isProcessing) {
      setApiProgress(null);
    }
  }, [isLoading, isProcessing]);

  // Sync edited transcript with pending transcript
  useEffect(() => {
    if (pendingTranscript) {
      setEditedTranscript(pendingTranscript);
    }
  }, [pendingTranscript]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  useEffect(() => {
    if (error) {
      announceForAccessibility(`Error: ${error}`);
    }
  }, [error]);

  const handleStartRecording = useCallback(async () => {
    if (isSpeaking) {
      await stopSpeaking();
    }
    try {
      await startRecording();
    } catch {
      // Error is handled in context
    }
  }, [isSpeaking, stopSpeaking, startRecording]);

  const handleStopRecording = useCallback(async () => {
    await stopRecordingForEdit();
  }, [stopRecordingForEdit]);

  const handleCancelRecording = useCallback(async () => {
    await cancelRecording();
  }, [cancelRecording]);

  const handleTextSubmit = useCallback(async () => {
    if (textInput.trim()) {
      await sendMessage(textInput.trim());
      setTextInput('');
    }
  }, [textInput, sendMessage]);

  const handleClearChat = useCallback(() => {
    Alert.alert(
      'Clear Conversation',
      'Are you sure you want to clear all messages?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearMessages();
            announceForAccessibility('Conversation cleared');
          },
        },
      ]
    );
  }, [clearMessages]);

  const handleConfirmTranscript = useCallback(async () => {
    if (editedTranscript.trim()) {
      editTranscript(editedTranscript.trim());
      await confirmTranscript();
    }
  }, [editedTranscript, editTranscript, confirmTranscript]);

  const handleDismissTranscript = useCallback(() => {
    dismissTranscript();
    setEditedTranscript('');
  }, [dismissTranscript]);

  // #12: auto-send flow. The transcript modal is suppressed (see
  // renderTranscriptEditModal) when review-before-send is off; instead the
  // transcript sends after a 5-second undo window.
  const showTranscriptModal = isPendingTranscriptVisible && confirmVoiceMessage;

  const commitAutoSend = useCallback(async () => {
    clearUndoTimer();
    setUndoVisible(false);
    await confirmTranscript();
  }, [clearUndoTimer, confirmTranscript]);

  const handleUndoAutoSend = useCallback(() => {
    clearUndoTimer();
    setUndoVisible(false);
    dismissTranscript();
    setEditedTranscript('');
    announceForAccessibility('Message not sent');
  }, [clearUndoTimer, dismissTranscript]);

  useEffect(() => {
    if (isPendingTranscriptVisible && pendingTranscript && !confirmVoiceMessage) {
      setUndoVisible(true);
      announceForAccessibility(`${t.chat.sendingYourMessage} ${t.undo}`);
      clearUndoTimer();
      undoTimerRef.current = setTimeout(() => {
        commitAutoSend();
      }, AUTO_SEND_UNDO_MS);
    } else if (!isPendingTranscriptVisible) {
      clearUndoTimer();
      setUndoVisible(false);
    }
  }, [isPendingTranscriptVisible, pendingTranscript, confirmVoiceMessage, clearUndoTimer, commitAutoSend, t]);

  const renderMessage = useCallback(
    ({ item, index }: { item: Message; index: number }) => (
      <ChatBubble message={item} isLatest={index === messages.length - 1} />
    ),
    [messages.length]
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  const renderEmptyState = () => {
    // Show loading state while loading history
    if (isLoadingHistory) {
      return (
        <View style={styles.emptyContainer}>
          <LoadingIndicator message="Loading your conversation..." />
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Text
          style={[styles.emptyTitle, { color: colors.text, fontSize: fonts.headerLarge }]}
        >
          {t.chat.emptyTitle}
        </Text>
        <Text
          style={[
            styles.emptySubtitle,
            { color: colors.textSecondary, fontSize: fonts.body },
          ]}
        >
          {t.chat.emptySubtitle}
        </Text>
      </View>
    );
  };

  // Render the "Did I hear that right?" modal — suppressed when auto-send
  // is on (#12); the undo banner handles that case instead.
  const renderTranscriptEditModal = () => (
    <Modal
      visible={showTranscriptModal}
      animationType="slide"
      transparent={true}
      onRequestClose={handleDismissTranscript}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <Text
            style={[
              styles.modalTitle,
              { color: colors.text, fontSize: fonts.header },
            ]}
          >
            Did I hear that right?
          </Text>

          <Text
            style={[
              styles.modalSubtitle,
              { color: colors.textSecondary, fontSize: fonts.body },
            ]}
          >
            You can edit your message before sending
          </Text>

          <TextInput
            style={[
              styles.transcriptInput,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                fontSize: fonts.bodyLarge,
                borderColor: colors.primary,
              },
            ]}
            value={editedTranscript}
            onChangeText={setEditedTranscript}
            multiline
            autoFocus
            accessible={true}
            accessibilityLabel="Edit your message"
            accessibilityHint="Your spoken words are shown here. Edit if needed."
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.cancelModalButton,
                { backgroundColor: colors.surface },
              ]}
              onPress={handleDismissTranscript}
              accessible={true}
              accessibilityLabel="Cancel and discard"
              accessibilityRole="button"
            >
              <Text style={[styles.modalButtonText, { color: colors.error }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.sendModalButton,
                {
                  backgroundColor: editedTranscript.trim()
                    ? colors.primary
                    : colors.surface,
                },
              ]}
              onPress={handleConfirmTranscript}
              disabled={!editedTranscript.trim()}
              accessible={true}
              accessibilityLabel="Send message"
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.modalButtonText,
                  {
                    color: editedTranscript.trim() ? '#FFFFFF' : colors.textSecondary,
                  },
                ]}
              >
                Send
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Render speaking indicator with stop button
  const renderSpeakingIndicator = () => {
    if (!isSpeaking) return null;

    return (
      <View style={[styles.speakingBar, { backgroundColor: colors.primary }]}>
        <View style={styles.speakingContent}>
          <View style={styles.speakingDots}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[styles.speakingDot, { backgroundColor: '#FFFFFF' }]}
              />
            ))}
          </View>
          <Text style={styles.speakingText}>{t.chat.speaking}</Text>
        </View>
        <TouchableOpacity
          style={styles.stopSpeakingButton}
          onPress={stopSpeaking}
          accessible={true}
          accessibilityLabel="Stop Karuna from speaking"
          accessibilityRole="button"
        >
          <Text style={styles.stopSpeakingText}>Stop</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render permission blocked screen
  if (permissionBlocked) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.permissionContainer}>
          <Text
            style={[
              styles.permissionTitle,
              { color: colors.text, fontSize: fonts.headerLarge },
            ]}
          >
            Microphone Access Needed
          </Text>
          <Text
            style={[
              styles.permissionText,
              { color: colors.textSecondary, fontSize: fonts.body },
            ]}
          >
            To talk with Karuna, you need to allow microphone access in your device settings.
          </Text>
          <TouchableOpacity
            style={[styles.settingsButton, { backgroundColor: colors.primary }]}
            onPress={openSettings}
            accessible={true}
            accessibilityLabel="Open Settings"
            accessibilityRole="button"
          >
            <Text style={styles.settingsButtonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.background}
      />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.surface }]}>
        <Text
          style={[styles.headerTitle, { color: colors.text, fontSize: fonts.header }]}
          accessible={true}
          accessibilityRole="header"
        >
          Karuna
        </Text>
        <View style={styles.headerActions}>
          {messages.length > 0 && (
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.surface }]}
              onPress={handleClearChat}
              accessible={true}
              accessibilityLabel="Clear conversation"
              accessibilityRole="button"
            >
              <Text style={[styles.headerButtonText, { color: colors.error }]}>
                Clear
              </Text>
            </TouchableOpacity>
          )}
          {onOpenHealth && (
            <TouchableOpacity
              style={[styles.headerButton, styles.healthButton, { backgroundColor: '#E8F5E9' }]}
              onPress={onOpenHealth}
              accessible={true}
              accessibilityLabel="Open health dashboard"
              accessibilityRole="button"
            >
              <Text style={styles.headerButtonIcon}>❤️</Text>
              <Text style={[styles.headerButtonLabel, { color: '#2E7D32' }]}>Health</Text>
            </TouchableOpacity>
          )}
          {onOpenVault && (
            <TouchableOpacity
              style={[styles.headerButton, styles.vaultButton, { backgroundColor: '#FFF3E0' }]}
              onPress={onOpenVault}
              accessible={true}
              accessibilityLabel="Open your secure vault"
              accessibilityRole="button"
            >
              <Text style={styles.headerButtonIcon}>🔐</Text>
              <Text style={[styles.headerButtonLabel, { color: '#E65100' }]}>Vault</Text>
            </TouchableOpacity>
          )}
          {onOpenCareCircle && (
            <TouchableOpacity
              style={[styles.headerButton, styles.careCircleButton, { backgroundColor: '#E3F2FD' }]}
              onPress={onOpenCareCircle}
              accessible={true}
              accessibilityLabel="Open Care Circle settings"
              accessibilityRole="button"
            >
              <Text style={styles.headerButtonIcon}>👨‍👩‍👧</Text>
              <Text style={[styles.headerButtonLabel, { color: '#1976D2' }]}>Family</Text>
            </TouchableOpacity>
          )}
          {onOpenSettings && (
            <TouchableOpacity
              style={[styles.headerButton, { backgroundColor: colors.surface }]}
              onPress={onOpenSettings}
              accessible={true}
              accessibilityLabel="Open Settings"
              accessibilityRole="button"
            >
              <Text style={styles.headerButtonIcon}>⚙️</Text>
              <Text style={[styles.headerButtonLabel, { color: colors.text }]}>Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Weather widget */}
      <WeatherWidget />

      {/* Speaking indicator */}
      {renderSpeakingIndicator()}

      {/* Error banner */}
      {error && (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: colors.error }]}
          onPress={clearError}
          accessible={true}
          accessibilityLabel={`Error: ${error}. Tap to dismiss.`}
          accessibilityRole="alert"
        >
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>Tap to dismiss</Text>
        </TouchableOpacity>
      )}

      {/* #30: TTS failure banner (message is already translated by the service) */}
      {ttsError && !error && (
        <TouchableOpacity
          style={[styles.errorBanner, { backgroundColor: colors.error }]}
          onPress={() => setTtsError(null)}
          accessible={true}
          accessibilityLabel={`${ttsError}. Tap to dismiss.`}
          accessibilityRole="alert"
        >
          <Text style={styles.errorText}>{ttsError}</Text>
          <Text style={styles.errorDismiss}>Tap to dismiss</Text>
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            styles.messageList,
            messages.length === 0 && styles.emptyList,
          ]}
          ListEmptyComponent={renderEmptyState}
          ListFooterComponent={
            isLoading ? (
              <View style={styles.loadingContainer}>
                <LoadingIndicator message={t.chat.thinking} />
                {/* #40: "Still working…" appears here when a request runs long */}
                {apiProgress && (
                  <Text
                    style={[styles.apiProgressText, { color: colors.textSecondary }]}
                    accessible={true}
                    accessibilityLiveRegion="polite"
                  >
                    {apiProgress}
                  </Text>
                )}
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />

        {/* #12: undo banner while a voice transcript waits to auto-send */}
        {undoVisible && (
          <View
            style={[styles.undoBanner, { backgroundColor: colors.surface }]}
            accessible={true}
            accessibilityRole="alert"
            accessibilityLabel={`${t.chat.sendingYourMessage} ${pendingTranscript ?? ''}`}
          >
            <Text
              style={[styles.undoText, { color: colors.text }]}
              numberOfLines={2}
            >
              {t.chat.sendingYourMessage}
            </Text>
            <TouchableOpacity
              style={[styles.undoButton, { borderColor: colors.primary }]}
              onPress={handleUndoAutoSend}
              accessible={true}
              accessibilityLabel={t.undo}
              accessibilityRole="button"
            >
              <Text style={[styles.undoButtonText, { color: colors.primary }]}>
                {t.undo}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
          {showTextInput ? (
            <View style={styles.textInputContainer}>
              {/* #11: switch back to voice mode (header toggle removed to
                  avoid two controls doing the same job). */}
              <TouchableOpacity
                style={[styles.voiceInsteadButton, { backgroundColor: colors.surface }]}
                onPress={() => setShowTextInput(false)}
                accessible={true}
                accessibilityLabel={t.chat.voiceMode}
                accessibilityHint={t.chat.voiceInsteadHint}
                accessibilityRole="button"
              >
                <Text style={[styles.voiceInsteadText, { color: colors.primary }]}>
                  🎤 {t.chat.voiceMode}
                </Text>
              </TouchableOpacity>
              <TextInput
                ref={textInputRef}
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.background,
                    color: colors.text,
                    fontSize: fonts.body,
                  },
                ]}
                value={textInput}
                onChangeText={setTextInput}
                placeholder={t.chat.typeMessage}
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={500}
                accessible={true}
                accessibilityLabel={t.chat.typeMessage}
                accessibilityHint={t.chat.typeMessageHint}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  {
                    backgroundColor: textInput.trim()
                      ? colors.primary
                      : colors.surface,
                  },
                ]}
                onPress={handleTextSubmit}
                disabled={!textInput.trim() || isLoading}
                accessible={true}
                accessibilityLabel={t.chat.send}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.sendButtonText,
                    {
                      color: textInput.trim() ? '#FFFFFF' : colors.textSecondary,
                    },
                  ]}
                >
                  {t.chat.send}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.voiceColumn}>
              <VoiceButton
                isRecording={isRecording}
                isProcessing={isProcessing}
                isDisabled={isLoading}
                recordingDuration={recordingDuration}
                onPressIn={handleStartRecording}
                onPressOut={handleStopRecording}
                onCancel={handleCancelRecording}
                tapToTalk={tapToTalk}
              />
              {/* #11: persistent "Type instead" beside the voice control */}
              {!isRecording && !isProcessing && (
                <TouchableOpacity
                  style={styles.typeInsteadButton}
                  onPress={() => {
                    setShowTextInput(true);
                    setTimeout(() => textInputRef.current?.focus(), 150);
                  }}
                  accessible={true}
                  accessibilityLabel={t.chat.typeInstead}
                  accessibilityHint={t.chat.typeInsteadHint}
                  accessibilityRole="button"
                >
                  <Text style={[styles.typeInsteadText, { color: colors.primary }]}>
                    {t.chat.typeInstead}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Transcript edit modal */}
      {renderTranscriptEditModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    // The header has a small "Karuna" title plus 5-6 action buttons. On a
    // ~390 dp phone they don't fit on one row, so the row wraps to a second
    // line rather than clipping (which previously hid Settings off-screen).
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    gap: SPACING.xs,
  },
  headerTitle: {
    fontWeight: '700',
    marginRight: 'auto', // push action buttons to the right when there's room
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SPACING.xs,
    justifyContent: 'flex-end',
  },
  headerButton: {
    // Compact padding so 5-6 buttons fit on one row when possible. Touch
    // target is still ≥48 dp because minWidth/minHeight enforce it.
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
    minWidth: TOUCH_TARGETS.minimum,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  // Icon (emoji) + label (14px text) stacked vertically. Per the audit,
  // emoji-only nav was unreadable for elderly users — the label confirms
  // what each button does at-a-glance.
  headerButtonIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
  headerButtonLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  vaultButton: {
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  healthButton: {
    borderWidth: 1,
    borderColor: '#81C784',
  },
  careCircleButton: {
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  speakingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  speakingContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  speakingDots: {
    flexDirection: 'row',
    marginRight: SPACING.sm,
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 2,
  },
  speakingText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  stopSpeakingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
  },
  stopSpeakingText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  errorBanner: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  errorText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
  },
  errorDismiss: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  messageList: {
    paddingVertical: SPACING.md,
    flexGrow: 1,
  },
  emptyList: {
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  emptySubtitle: {
    textAlign: 'center',
    lineHeight: 26,
  },
  loadingContainer: {
    paddingVertical: SPACING.md,
  },
  inputContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...Platform.select({
      web: { boxShadow: '0px -2px 8px rgba(0, 0, 0, 0.1)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
    }),
  },
  textInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  voiceInsteadButton: {
    minHeight: TOUCH_TARGETS.minimum,
    minWidth: TOUCH_TARGETS.minimum,
    paddingHorizontal: SPACING.sm,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceInsteadText: {
    fontSize: 16,
    fontWeight: '600',
  },
  textInput: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    maxHeight: 120,
    minHeight: TOUCH_TARGETS.comfortable,
  },
  sendButton: {
    width: TOUCH_TARGETS.comfortable,
    height: TOUCH_TARGETS.comfortable,
    borderRadius: TOUCH_TARGETS.comfortable / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  apiProgressText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  // Voice-mode column: voice button + persistent "Type instead" (#11)
  voiceColumn: {
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  typeInsteadButton: {
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeInsteadText: {
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // #12: undo banner shown during the auto-send window
  undoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  undoText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginRight: SPACING.sm,
  },
  undoButton: {
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  modalTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  modalSubtitle: {
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  transcriptInput: {
    borderWidth: 2,
    borderRadius: 16,
    padding: SPACING.md,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGETS.comfortable,
  },
  cancelModalButton: {},
  sendModalButton: {},
  modalButtonText: {
    fontWeight: '700',
    fontSize: 18,
  },
  // Permission blocked screen
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  permissionTitle: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  permissionText: {
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: SPACING.xl,
  },
  settingsButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 24,
    minHeight: TOUCH_TARGETS.comfortable,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },
});

export default ChatScreen;
