import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Text,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useChatContext } from '../context/ChatContext';
import { Message } from '../types';
import { VoiceButton } from './VoiceButton';
import { ChatBubble } from './ChatBubble';
import { LoadingIndicator } from './LoadingIndicator';
import {
  getColors,
  getFontSizes,
  SPACING,
  TOUCH_TARGETS,
  announceForAccessibility,
} from '../utils/accessibility';

interface ChatScreenProps {
  onOpenSettings?: () => void;
  onOpenVault?: () => void;
  onOpenCareCircle?: () => void;
  onOpenHealth?: () => void;
}

export function ChatScreen({ onOpenSettings, onOpenVault, onOpenCareCircle, onOpenHealth }: ChatScreenProps): JSX.Element {
  const colors = getColors(true);
  const fonts = getFontSizes('large');

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
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');

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
    } catch (err) {
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
          Hello! I'm Karuna
        </Text>
        <Text
          style={[
            styles.emptySubtitle,
            { color: colors.textSecondary, fontSize: fonts.body },
          ]}
        >
          Your friendly voice assistant.{'\n'}
          Hold the button below and speak to me.
        </Text>
      </View>
    );
  };

  // Render the "Did I hear that right?" modal
  const renderTranscriptEditModal = () => (
    <Modal
      visible={isPendingTranscriptVisible}
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
          <Text style={styles.speakingText}>Karuna is speaking...</Text>
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
          <TouchableOpacity
            style={[styles.headerButton, { backgroundColor: colors.surface }]}
            onPress={() => setShowTextInput(!showTextInput)}
            accessible={true}
            accessibilityLabel={showTextInput ? 'Switch to voice input' : 'Switch to typing'}
            accessibilityRole="button"
          >
            <Text style={[styles.headerButtonText, { color: colors.primary }]}>
              {showTextInput ? 'Voice' : 'Type'}
            </Text>
          </TouchableOpacity>
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
              <Text style={[styles.headerButtonText, { color: '#2E7D32' }]}>
                ❤️
              </Text>
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
              <Text style={[styles.headerButtonText, { color: '#E65100' }]}>
                🔐 Vault
              </Text>
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
              <Text style={[styles.headerButtonText, { color: '#1976D2' }]}>
                👨‍👩‍👧
              </Text>
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
              <Text style={[styles.headerButtonText, { color: colors.text }]}>
                Settings
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
                <LoadingIndicator message="Karuna is thinking..." />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />

        <View style={[styles.inputContainer, { backgroundColor: colors.surface }]}>
          {showTextInput ? (
            <View style={styles.textInputContainer}>
              <TextInput
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
                placeholder="Type your message..."
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={500}
                accessible={true}
                accessibilityLabel="Message input"
                accessibilityHint="Type your message here"
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
                accessibilityLabel="Send message"
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
                  Send
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <VoiceButton
              isRecording={isRecording}
              isProcessing={isProcessing}
              isDisabled={isLoading}
              recordingDuration={recordingDuration}
              onPressIn={handleStartRecording}
              onPressOut={handleStopRecording}
              onCancel={handleCancelRecording}
            />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  headerButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    minWidth: TOUCH_TARGETS.minimum,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontWeight: '600',
    fontSize: 14,
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
    fontSize: 14,
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
    fontWeight: '500',
    textAlign: 'center',
  },
  errorDismiss: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
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
    fontSize: 14,
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
