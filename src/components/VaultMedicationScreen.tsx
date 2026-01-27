import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { vaultService } from '../services/vault';
import { VaultMedication, MedicationFrequency } from '../types/vault';
import {
  VaultFormInput,
  VaultSelectButton,
  VaultBigButton,
  VaultToggle,
} from './VaultFormInput';

interface VaultMedicationScreenProps {
  onClose: () => void;
}

const FREQUENCY_OPTIONS: { label: string; value: MedicationFrequency }[] = [
  { label: 'Once daily', value: 'once_daily' },
  { label: 'Twice daily', value: 'twice_daily' },
  { label: '3 times daily', value: 'thrice_daily' },
  { label: '4 times daily', value: 'four_times_daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'As needed', value: 'as_needed' },
];

const FORM_OPTIONS = [
  { label: '💊 Tablet', value: 'tablet' },
  { label: '💊 Capsule', value: 'capsule' },
  { label: '🧴 Syrup', value: 'syrup' },
  { label: '💉 Injection', value: 'injection' },
  { label: '👁️ Drops', value: 'drops' },
  { label: '🧴 Cream', value: 'cream' },
];

export function VaultMedicationScreen({
  onClose,
}: VaultMedicationScreenProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [medications, setMedications] = useState<VaultMedication[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMed, setEditingMed] = useState<VaultMedication | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [strength, setStrength] = useState('');
  const [form, setForm] = useState('tablet');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState<MedicationFrequency>('once_daily');
  const [times, setTimes] = useState('');
  const [withFood, setWithFood] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [prescribedBy, setPrescribedBy] = useState('');
  const [reason, setReason] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    loadMedications();
  }, []);

  const loadMedications = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getMedications();
      setMedications(data);
    } catch (error) {
      console.error('Failed to load medications:', error);
    }
    setIsLoading(false);
  };

  const populateForm = (med: VaultMedication) => {
    setEditingMed(med);
    setName(med.name);
    setGenericName(med.genericName || '');
    setStrength(med.strength || '');
    setForm(med.form || 'tablet');
    setDosage(med.dosage);
    setFrequency(med.frequency);
    setTimes(med.times?.join(', ') || '');
    setWithFood(med.withFood || false);
    setInstructions(med.instructions || '');
    setPrescribedBy(med.prescribedBy || '');
    setReason(med.reason || '');
    setIsActive(med.isActive);
  };

  const resetForm = () => {
    setEditingMed(null);
    setName('');
    setGenericName('');
    setStrength('');
    setForm('tablet');
    setDosage('');
    setFrequency('once_daily');
    setTimes('');
    setWithFood(false);
    setInstructions('');
    setPrescribedBy('');
    setReason('');
    setIsActive(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter the medication name');
      return;
    }
    if (!dosage.trim()) {
      Alert.alert('Required', 'Please enter the dosage');
      return;
    }

    setIsSaving(true);
    try {
      const medData = {
        name: name.trim(),
        genericName: genericName.trim() || undefined,
        strength: strength.trim() || undefined,
        form: form || undefined,
        dosage: dosage.trim(),
        frequency,
        times: times.trim() ? times.split(',').map(t => t.trim()) : undefined,
        withFood,
        instructions: instructions.trim() || undefined,
        prescribedBy: prescribedBy.trim() || undefined,
        reason: reason.trim() || undefined,
        isActive,
      };

      if (editingMed) {
        await vaultService.updateMedication(editingMed.id, medData);
        Alert.alert('Saved', 'Medication updated successfully');
      } else {
        await vaultService.addMedication(medData);
        Alert.alert('Saved', 'Medication added successfully');
      }

      resetForm();
      setShowForm(false);
      loadMedications();
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save medication. Please try again.');
    }
    setIsSaving(false);
  };

  const handleDelete = (med: VaultMedication) => {
    Alert.alert(
      'Delete Medication',
      `Are you sure you want to delete "${med.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await vaultService.deleteMedication(med.id);
            loadMedications();
          },
        },
      ]
    );
  };

  const handleEdit = (med: VaultMedication) => {
    populateForm(med);
    setShowForm(true);
  };

  const handleToggleActive = async (med: VaultMedication) => {
    await vaultService.updateMedication(med.id, { isActive: !med.isActive });
    loadMedications();
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header onClose={onClose} title="Medications" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        onClose={showForm ? () => { resetForm(); setShowForm(false); } : onClose}
        title={showForm ? (editingMed ? 'Edit Medication' : 'Add Medication') : 'Medications'}
        showBack={showForm}
      />

      {!showForm ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultBigButton
            title="Add New Medication"
            icon="➕"
            onPress={() => setShowForm(true)}
          />

          {medications.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💊</Text>
              <Text style={styles.emptyText}>No medications yet</Text>
              <Text style={styles.emptySubtext}>
                Add your medications to keep track of schedules and dosages
              </Text>
            </View>
          ) : (
            <>
              {/* Active medications */}
              {medications.filter(m => m.isActive).length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Active Medications</Text>
                  {medications.filter(m => m.isActive).map(med => (
                    <MedicationCard
                      key={med.id}
                      medication={med}
                      onEdit={() => handleEdit(med)}
                      onDelete={() => handleDelete(med)}
                      onToggleActive={() => handleToggleActive(med)}
                    />
                  ))}
                </>
              )}

              {/* Inactive medications */}
              {medications.filter(m => !m.isActive).length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Past Medications</Text>
                  {medications.filter(m => !m.isActive).map(med => (
                    <MedicationCard
                      key={med.id}
                      medication={med}
                      onEdit={() => handleEdit(med)}
                      onDelete={() => handleDelete(med)}
                      onToggleActive={() => handleToggleActive(med)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultFormInput
            label="Medication Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g., Metformin"
            required
            icon="💊"
          />

          <VaultFormInput
            label="Generic Name"
            value={genericName}
            onChangeText={setGenericName}
            placeholder="e.g., Metformin Hydrochloride"
            icon="📝"
          />

          <VaultFormInput
            label="Strength"
            value={strength}
            onChangeText={setStrength}
            placeholder="e.g., 500mg"
            icon="💪"
          />

          <VaultSelectButton
            label="Form"
            value={form}
            options={FORM_OPTIONS}
            onSelect={setForm}
            icon="💊"
          />

          <VaultFormInput
            label="Dosage"
            value={dosage}
            onChangeText={setDosage}
            placeholder="e.g., 1 tablet"
            required
            icon="📏"
          />

          <VaultSelectButton
            label="Frequency"
            value={frequency}
            options={FREQUENCY_OPTIONS}
            onSelect={(v) => setFrequency(v as MedicationFrequency)}
            icon="🔄"
          />

          <VaultFormInput
            label="Times (comma separated)"
            value={times}
            onChangeText={setTimes}
            placeholder="e.g., 8:00 AM, 8:00 PM"
            icon="🕐"
          />

          <VaultToggle
            label="Take with food"
            value={withFood}
            onToggle={setWithFood}
            description="Should this medication be taken with meals?"
          />

          <VaultFormInput
            label="Instructions"
            value={instructions}
            onChangeText={setInstructions}
            placeholder="Any special instructions..."
            multiline
            numberOfLines={3}
            icon="📋"
          />

          <VaultFormInput
            label="Prescribed By"
            value={prescribedBy}
            onChangeText={setPrescribedBy}
            placeholder="e.g., Dr. Sharma"
            icon="👨‍⚕️"
          />

          <VaultFormInput
            label="Reason / Condition"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g., Diabetes management"
            icon="🩺"
          />

          <VaultToggle
            label="Currently taking"
            value={isActive}
            onToggle={setIsActive}
            description="Is this an active medication?"
          />

          <View style={styles.buttonContainer}>
            <VaultBigButton
              title={isSaving ? 'Saving...' : 'Save Medication'}
              icon="💾"
              onPress={handleSave}
              disabled={isSaving}
            />

            <VaultBigButton
              title="Cancel"
              onPress={() => { resetForm(); setShowForm(false); }}
              variant="secondary"
            />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// Header component
interface HeaderProps {
  onClose: () => void;
  title: string;
  showBack?: boolean;
}

function Header({ onClose, title, showBack }: HeaderProps): JSX.Element {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} style={styles.backButton}>
        <Text style={styles.backButtonText}>{showBack ? '← Back' : '← Vault'}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.placeholder} />
    </View>
  );
}

// Medication Card component
interface MedicationCardProps {
  medication: VaultMedication;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

function MedicationCard({
  medication,
  onEdit,
  onDelete,
  onToggleActive,
}: MedicationCardProps): JSX.Element {
  const formEmoji = {
    tablet: '💊',
    capsule: '💊',
    syrup: '🧴',
    injection: '💉',
    drops: '👁️',
    cream: '🧴',
  }[medication.form || 'tablet'] || '💊';

  const frequencyText = {
    once_daily: 'Once daily',
    twice_daily: 'Twice daily',
    thrice_daily: '3 times daily',
    four_times_daily: '4 times daily',
    weekly: 'Weekly',
    as_needed: 'As needed',
    custom: 'Custom',
  }[medication.frequency];

  return (
    <View style={[styles.card, !medication.isActive && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{formEmoji}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{medication.name}</Text>
          {medication.strength && (
            <Text style={styles.cardStrength}>{medication.strength}</Text>
          )}
        </View>
        {!medication.isActive && (
          <View style={styles.inactiveBadge}>
            <Text style={styles.inactiveBadgeText}>Stopped</Text>
          </View>
        )}
      </View>

      <View style={styles.cardDetails}>
        <Text style={styles.cardDosage}>
          📏 {medication.dosage} • {frequencyText}
        </Text>
        {medication.times && medication.times.length > 0 && (
          <Text style={styles.cardTime}>
            🕐 {medication.times.join(', ')}
          </Text>
        )}
        {medication.withFood && (
          <Text style={styles.cardInstruction}>🍽️ Take with food</Text>
        )}
        {medication.reason && (
          <Text style={styles.cardReason}>🩺 {medication.reason}</Text>
        )}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardActionButton} onPress={onToggleActive}>
          <Text style={styles.cardActionText}>
            {medication.isActive ? '⏹️ Stop' : '▶️ Resume'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardActionButton} onPress={onEdit}>
          <Text style={styles.cardActionText}>✏️ Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardDeleteButton} onPress={onDelete}>
          <Text style={styles.cardDeleteText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 18,
    color: '#2196F3',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 80,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 12,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardInactive: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  cardStrength: {
    fontSize: 16,
    color: '#666',
    marginTop: 2,
  },
  inactiveBadge: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  inactiveBadgeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  cardDetails: {
    marginBottom: 12,
  },
  cardDosage: {
    fontSize: 16,
    color: '#2196F3',
    marginBottom: 4,
  },
  cardTime: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  cardInstruction: {
    fontSize: 16,
    color: '#4CAF50',
    marginBottom: 4,
  },
  cardReason: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
    marginTop: 8,
  },
  cardActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  cardActionText: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '600',
  },
  cardDeleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  cardDeleteText: {
    fontSize: 16,
    color: '#F44336',
  },

  buttonContainer: {
    marginTop: 20,
  },
});

export default VaultMedicationScreen;
