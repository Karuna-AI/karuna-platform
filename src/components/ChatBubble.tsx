import React from 'react';
import { View, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import { Message } from '../types';
import { getColors, getFontSizes, SPACING } from '../utils/accessibility';

interface ChatBubbleProps {
  message: Message;
  isLatest?: boolean;
}

export function ChatBubble({
  message,
  isLatest = false,
}: ChatBubbleProps): JSX.Element {
  const colors = getColors(true);
  const fonts = getFontSizes('large');

  const isUser = message.role === 'user';

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const accessibilityLabel = `${isUser ? 'You said' : 'Karuna said'}: ${
    message.content
  }. ${formatTime(message.timestamp)}`;

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.assistantContainer,
      ]}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
    >
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser
              ? colors.userBubble
              : colors.assistantBubble,
          },
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        {!isUser && (
          <Text
            style={[
              styles.senderLabel,
              { color: colors.primary, fontSize: fonts.body - 2 },
            ]}
          >
            Karuna
          </Text>
        )}
        <Text
          style={[
            styles.messageText,
            { color: colors.text, fontSize: fonts.body },
          ]}
        >
          {message.content}
        </Text>
        <Text
          style={[
            styles.timestamp,
            { color: colors.textSecondary, fontSize: fonts.body - 4 },
          ]}
        >
          {formatTime(message.timestamp)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    width: '100%',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  assistantContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderRadius: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
  },
  senderLabel: {
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  messageText: {
    lineHeight: 24,
  },
  timestamp: {
    marginTop: SPACING.xs,
    alignSelf: 'flex-end',
  },
});

export default ChatBubble;
