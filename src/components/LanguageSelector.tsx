/**
 * Language Selector Component
 * A modal-based language picker with grouped languages for 50+ supported languages
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  SafeAreaView,
} from 'react-native';
import {
  LanguageCode,
  LanguageConfig,
  LANGUAGES,
  LANGUAGE_GROUPS,
  getLanguageConfig,
} from '../i18n/languages';
import { SPACING, TOUCH_TARGETS } from '../utils/accessibility';

interface LanguageSelectorProps {
  visible: boolean;
  currentLanguage: LanguageCode;
  onSelect: (language: LanguageCode) => void;
  onClose: () => void;
  fontSize?: number;
}

interface LanguageGroupProps {
  title: string;
  languages: LanguageCode[];
  currentLanguage: LanguageCode;
  onSelect: (language: LanguageCode) => void;
  fontSize: number;
  searchQuery: string;
}

function LanguageGroup({
  title,
  languages,
  currentLanguage,
  onSelect,
  fontSize,
  searchQuery,
}: LanguageGroupProps): JSX.Element | null {
  const filteredLanguages = useMemo(() => {
    if (!searchQuery) return languages;

    const query = searchQuery.toLowerCase();
    return languages.filter((code) => {
      const config = getLanguageConfig(code);
      return (
        config.name.toLowerCase().includes(query) ||
        config.nativeName.toLowerCase().includes(query) ||
        code.toLowerCase().includes(query)
      );
    });
  }, [languages, searchQuery]);

  if (filteredLanguages.length === 0) {
    return null;
  }

  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { fontSize: fontSize - 2 }]}>{title}</Text>
      <View style={styles.languageList}>
        {filteredLanguages.map((code) => {
          const config = getLanguageConfig(code);
          const isSelected = code === currentLanguage;

          return (
            <TouchableOpacity
              key={code}
              style={[
                styles.languageItem,
                isSelected && styles.languageItemSelected,
              ]}
              onPress={() => onSelect(code)}
              accessible={true}
              accessibilityLabel={`${config.name}, ${config.nativeName}`}
              accessibilityState={{ selected: isSelected }}
              accessibilityRole="button"
            >
              <View style={styles.languageInfo}>
                <Text
                  style={[
                    styles.languageName,
                    { fontSize },
                    isSelected && styles.languageNameSelected,
                  ]}
                >
                  {config.nativeName}
                </Text>
                <Text
                  style={[
                    styles.languageNameEnglish,
                    { fontSize: fontSize - 2 },
                    isSelected && styles.languageNameEnglishSelected,
                  ]}
                >
                  {config.name}
                </Text>
              </View>
              {isSelected && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function LanguageSelector({
  visible,
  currentLanguage,
  onSelect,
  onClose,
  fontSize = 16,
}: LanguageSelectorProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSelect = useCallback(
    (language: LanguageCode) => {
      onSelect(language);
      onClose();
    },
    [onSelect, onClose]
  );

  const groupTitles: Record<keyof typeof LANGUAGE_GROUPS, string> = {
    indian: 'Indian Languages',
    european: 'European Languages',
    eastAsian: 'East Asian Languages',
    southeastAsian: 'Southeast Asian Languages',
    middleEastern: 'Middle Eastern Languages',
    african: 'African Languages',
  };

  const currentConfig = getLanguageConfig(currentLanguage);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessible={true}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <Text style={[styles.closeButtonText, { fontSize }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { fontSize: fontSize + 2 }]}>
            Select Language
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Current Selection */}
        <View style={styles.currentSelection}>
          <Text style={[styles.currentLabel, { fontSize: fontSize - 2 }]}>
            Current:
          </Text>
          <Text style={[styles.currentLanguage, { fontSize }]}>
            {currentConfig.nativeName} ({currentConfig.name})
          </Text>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { fontSize }]}
            placeholder="Search languages..."
            placeholderTextColor="#9E9E9E"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearch}
              onPress={() => setSearchQuery('')}
            >
              <Text style={styles.clearSearchText}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Language Groups */}
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {(Object.keys(LANGUAGE_GROUPS) as (keyof typeof LANGUAGE_GROUPS)[]).map(
            (groupKey) => (
              <LanguageGroup
                key={groupKey}
                title={groupTitles[groupKey]}
                languages={LANGUAGE_GROUPS[groupKey]}
                currentLanguage={currentLanguage}
                onSelect={handleSelect}
                fontSize={fontSize}
                searchQuery={searchQuery}
              />
            )
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  closeButton: {
    paddingVertical: SPACING.sm,
    paddingRight: SPACING.md,
    minHeight: TOUCH_TARGETS.minimum,
    justifyContent: 'center',
  },
  closeButtonText: {
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
  currentSelection: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentLabel: {
    color: '#1976D2',
    marginRight: SPACING.sm,
  },
  currentLanguage: {
    color: '#1976D2',
    fontWeight: '600',
    flex: 1,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    color: '#212121',
    minHeight: TOUCH_TARGETS.minimum,
  },
  clearSearch: {
    marginLeft: SPACING.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchText: {
    fontSize: 20,
    color: '#757575',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  group: {
    marginTop: SPACING.md,
  },
  groupTitle: {
    color: '#757575',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  languageList: {
    backgroundColor: '#FFFFFF',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: TOUCH_TARGETS.comfortable,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  languageItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    color: '#212121',
    fontWeight: '500',
  },
  languageNameSelected: {
    color: '#1976D2',
    fontWeight: '700',
  },
  languageNameEnglish: {
    color: '#757575',
    marginTop: 2,
  },
  languageNameEnglishSelected: {
    color: '#1976D2',
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  bottomPadding: {
    height: SPACING.xl * 2,
  },
});

export default LanguageSelector;
