import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
} from 'react-native';
import { storageService, UserMemory, KeyPerson } from '../services/storage';
import { getColors, getFontSizes, SPACING, TOUCH_TARGETS } from '../utils/accessibility';

interface MemoryViewerProps {
  onClose: () => void;
}

export function MemoryViewer({ onClose }: MemoryViewerProps): JSX.Element {
  const colors = getColors(true);
  const fonts = getFontSizes('large');

  const [memory, setMemory] = useState<UserMemory | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const loadMemory = useCallback(async () => {
    const data = await storageService.loadMemory();
    setMemory(data);
    setEditName(data.preferredName || '');
  }, []);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  const handleSaveName = useCallback(async () => {
    await storageService.updateMemory({ preferredName: editName.trim() || undefined });
    setIsEditing(false);
    loadMemory();
  }, [editName, loadMemory]);

  const handleRemovePerson = useCallback(async (personName: string) => {
    Alert.alert(
      'Remove Person',
      `Remove ${personName} from your memories?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!memory) return;
            const updated = memory.keyPeople.filter(p => p.name !== personName);
            await storageService.updateMemory({ keyPeople: updated });
            loadMemory();
          },
        },
      ]
    );
  }, [memory, loadMemory]);

  const handleRemoveInstruction = useCallback(async (index: number) => {
    if (!memory) return;
    const updated = [...memory.customInstructions];
    updated.splice(index, 1);
    await storageService.updateMemory({ customInstructions: updated });
    loadMemory();
  }, [memory, loadMemory]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Clear All Memories',
      'This will erase everything Karuna has learned about you. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await storageService.updateMemory({
              preferredName: undefined,
              keyPeople: [],
              customInstructions: [],
              remindersCreated: [],
              preferences: {},
            });
            loadMemory();
          },
        },
      ]
    );
  }, [loadMemory]);

  if (!memory) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: SPACING.xl }}>
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  const hasAnyData =
    memory.preferredName ||
    memory.keyPeople.length > 0 ||
    memory.customInstructions.length > 0 ||
    memory.preferences.speechRate ||
    memory.preferences.language;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.surface }]}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.backButton}
          accessible={true}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={[styles.backText, { color: colors.primary, fontSize: fonts.body }]}>
            ← Back
          </Text>
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: colors.text, fontSize: fonts.header }]}
          accessibilityRole="header"
        >
          What Karuna Knows
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.body - 1 }]}>
          Karuna learns from your conversations to personalize your experience.
          You can review and manage what it remembers here.
        </Text>

        {/* Preferred Name */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fonts.bodyLarge }]}>
            Your Name
          </Text>
          {isEditing ? (
            <View style={styles.editRow}>
              <TextInput
                style={[styles.nameInput, {
                  color: colors.text,
                  fontSize: fonts.body,
                  borderColor: colors.primary,
                  backgroundColor: colors.background,
                }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="Enter your name"
                placeholderTextColor={colors.textSecondary}
                autoFocus
              />
              <TouchableOpacity
                onPress={handleSaveName}
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.saveButtonText, { fontSize: fonts.body - 1 }]}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editableRow}>
              <Text style={[styles.value, { color: colors.text, fontSize: fonts.body }]}>
                {memory.preferredName || 'Not set'}
              </Text>
              <Text style={[styles.editHint, { color: colors.primary, fontSize: fonts.body - 2 }]}>
                Edit
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Key People */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fonts.bodyLarge }]}>
            People You've Mentioned
          </Text>
          {memory.keyPeople.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontSize: fonts.body - 1 }]}>
              No people remembered yet. Karuna learns about your family and friends from conversations.
            </Text>
          ) : (
            memory.keyPeople.map((person, index) => (
              <View key={`${person.name}-${index}`} style={[styles.personRow, { borderBottomColor: colors.background }]}>
                <View style={styles.personInfo}>
                  <Text style={[styles.personName, { color: colors.text, fontSize: fonts.body }]}>
                    {person.name}
                  </Text>
                  <Text style={[styles.personRelation, { color: colors.textSecondary, fontSize: fonts.body - 2 }]}>
                    {person.relationship}
                    {person.nickname ? ` (${person.nickname})` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleRemovePerson(person.name)}
                  accessible={true}
                  accessibilityLabel={`Remove ${person.name}`}
                >
                  <Text style={{ color: colors.error, fontSize: fonts.body }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Custom Instructions */}
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fonts.bodyLarge }]}>
            Things You've Asked Karuna to Remember
          </Text>
          {memory.customInstructions.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary, fontSize: fonts.body - 1 }]}>
              No custom instructions yet. Try saying "Remember that I prefer..." in chat.
            </Text>
          ) : (
            memory.customInstructions.map((instruction, index) => (
              <View key={index} style={[styles.instructionRow, { borderBottomColor: colors.background }]}>
                <Text style={[styles.instructionText, { color: colors.text, fontSize: fonts.body - 1 }]}>
                  {instruction}
                </Text>
                <TouchableOpacity
                  onPress={() => handleRemoveInstruction(index)}
                  accessible={true}
                  accessibilityLabel={`Remove instruction: ${instruction}`}
                >
                  <Text style={{ color: colors.error, fontSize: fonts.body }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Preferences */}
        {(memory.preferences.speechRate || memory.preferences.language) && (
          <View style={[styles.section, { backgroundColor: colors.surface }]}>
            <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fonts.bodyLarge }]}>
              Learned Preferences
            </Text>
            {memory.preferences.speechRate && (
              <Text style={[styles.prefItem, { color: colors.text, fontSize: fonts.body - 1 }]}>
                Speech speed: {memory.preferences.speechRate}
              </Text>
            )}
            {memory.preferences.language && (
              <Text style={[styles.prefItem, { color: colors.text, fontSize: fonts.body - 1 }]}>
                Language: {memory.preferences.language}
              </Text>
            )}
          </View>
        )}

        {/* Clear All */}
        {hasAnyData && (
          <TouchableOpacity
            style={[styles.clearButton, { borderColor: colors.error }]}
            onPress={handleClearAll}
            accessible={true}
            accessibilityLabel="Clear all memories"
            accessibilityRole="button"
          >
            <Text style={[styles.clearButtonText, { color: colors.error, fontSize: fonts.body }]}>
              Clear All Memories
            </Text>
          </TouchableOpacity>
        )}

        {!hasAnyData && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyStateTitle, { color: colors.text, fontSize: fonts.bodyLarge }]}>
              Nothing remembered yet
            </Text>
            <Text style={[styles.emptyStateText, { color: colors.textSecondary, fontSize: fonts.body - 1 }]}>
              As you chat with Karuna, it will learn your name, family members, preferences,
              and things you ask it to remember. Everything is stored only on your device.
            </Text>
          </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    minHeight: TOUCH_TARGETS.comfortable,
    justifyContent: 'center',
  },
  backText: {
    fontWeight: '600',
  },
  headerTitle: {
    fontWeight: '700',
  },
  headerSpacer: {
    width: 60,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  subtitle: {
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  section: {
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  saveButton: {
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  editableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {},
  editHint: {
    fontWeight: '600',
  },
  emptyText: {
    fontStyle: 'italic',
    lineHeight: 20,
  },
  personRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  personInfo: {
    flex: 1,
  },
  personName: {
    fontWeight: '600',
  },
  personRelation: {},
  instructionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  instructionText: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  prefItem: {
    paddingVertical: SPACING.xs,
  },
  clearButton: {
    borderWidth: 1,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  clearButtonText: {
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyStateTitle: {
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  emptyStateText: {
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default MemoryViewer;
