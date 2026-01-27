import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
} from 'react-native';

interface VaultFormInputProps extends TextInputProps {
  label: string;
  required?: boolean;
  error?: string;
  icon?: string;
}

export function VaultFormInput({
  label,
  required,
  error,
  icon,
  ...props
}: VaultFormInputProps): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {icon && <Text>{icon} </Text>}
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[
          styles.input,
          error && styles.inputError,
          props.multiline && styles.multilineInput,
        ]}
        placeholderTextColor="#999"
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

interface VaultSelectButtonProps {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  icon?: string;
}

export function VaultSelectButton({
  label,
  value,
  options,
  onSelect,
  icon,
}: VaultSelectButtonProps): JSX.Element {
  const selectedOption = options.find(o => o.value === value);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {icon && <Text>{icon} </Text>}
        {label}
      </Text>
      <View style={styles.optionsContainer}>
        {options.map(option => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.optionButton,
              value === option.value && styles.optionButtonSelected,
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text
              style={[
                styles.optionText,
                value === option.value && styles.optionTextSelected,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

interface VaultBigButtonProps {
  title: string;
  icon?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function VaultBigButton({
  title,
  icon,
  onPress,
  variant = 'primary',
  disabled,
}: VaultBigButtonProps): JSX.Element {
  const buttonStyle = [
    styles.bigButton,
    variant === 'secondary' && styles.bigButtonSecondary,
    variant === 'danger' && styles.bigButtonDanger,
    disabled && styles.bigButtonDisabled,
  ];

  const textStyle = [
    styles.bigButtonText,
    variant === 'secondary' && styles.bigButtonTextSecondary,
  ];

  return (
    <TouchableOpacity
      style={buttonStyle}
      onPress={onPress}
      disabled={disabled}
    >
      {icon && <Text style={styles.bigButtonIcon}>{icon}</Text>}
      <Text style={textStyle}>{title}</Text>
    </TouchableOpacity>
  );
}

interface VaultToggleProps {
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  description?: string;
}

export function VaultToggle({
  label,
  value,
  onToggle,
  description,
}: VaultToggleProps): JSX.Element {
  return (
    <TouchableOpacity
      style={styles.toggleContainer}
      onPress={() => onToggle(!value)}
    >
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description && <Text style={styles.toggleDescription}>{description}</Text>}
      </View>
      <View style={[styles.toggle, value && styles.toggleOn]}>
        <View style={[styles.toggleHandle, value && styles.toggleHandleOn]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#F44336',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 20,
    color: '#333',
  },
  inputError: {
    borderColor: '#F44336',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    marginTop: 4,
  },

  // Options
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    marginRight: 8,
    marginBottom: 8,
  },
  optionButtonSelected: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  optionText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#fff',
  },

  // Big Button
  bigButton: {
    backgroundColor: '#2196F3',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bigButtonSecondary: {
    backgroundColor: '#F5F5F5',
  },
  bigButtonDanger: {
    backgroundColor: '#F44336',
  },
  bigButtonDisabled: {
    opacity: 0.5,
  },
  bigButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  bigButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  bigButtonTextSecondary: {
    color: '#333',
  },

  // Toggle
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  toggleDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  toggle: {
    width: 60,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0E0E0',
    padding: 3,
  },
  toggleOn: {
    backgroundColor: '#4CAF50',
  },
  toggleHandle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  toggleHandleOn: {
    transform: [{ translateX: 26 }],
  },
});

export default VaultFormInput;
