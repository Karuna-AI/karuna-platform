import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { vaultService } from '../services/vault';
import { VaultAppointment, AppointmentType } from '../types/vault';
import {
  VaultFormInput,
  VaultSelectButton,
  VaultBigButton,
  VaultToggle,
} from './VaultFormInput';

interface VaultAppointmentScreenProps {
  onClose: () => void;
  editAppointmentId?: string;
}

const APPOINTMENT_TYPES: { label: string; value: AppointmentType }[] = [
  { label: '🩺 Doctor', value: 'doctor' },
  { label: '🏥 Hospital', value: 'hospital' },
  { label: '🧪 Lab Test', value: 'lab_test' },
  { label: '🧘 Therapy', value: 'therapy' },
  { label: '🏛️ Government', value: 'government' },
  { label: '🏦 Bank', value: 'bank' },
  { label: '⚖️ Legal', value: 'legal' },
  { label: '👥 Social', value: 'social' },
  { label: '📋 Other', value: 'other' },
];

const STATUS_OPTIONS: { label: string; value: VaultAppointment['status'] }[] = [
  { label: '📅 Scheduled', value: 'scheduled' },
  { label: '✅ Completed', value: 'completed' },
  { label: '❌ Cancelled', value: 'cancelled' },
  { label: '🔄 Rescheduled', value: 'rescheduled' },
];

export function VaultAppointmentScreen({
  onClose,
  editAppointmentId,
}: VaultAppointmentScreenProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [appointments, setAppointments] = useState<VaultAppointment[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<VaultAppointment | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [type, setType] = useState<AppointmentType>('doctor');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [withPerson, setWithPerson] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [status, setStatus] = useState<VaultAppointment['status']>('scheduled');
  const [preparationNotes, setPreparationNotes] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadAppointments();
  }, []);

  const loadAppointments = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getAppointments();
      setAppointments(data);
      if (editAppointmentId) {
        const appt = data.find(a => a.id === editAppointmentId);
        if (appt) {
          populateForm(appt);
          setShowForm(true);
        }
      }
    } catch (error) {
      console.error('Failed to load appointments:', error);
    }
    setIsLoading(false);
  };

  const populateForm = (appt: VaultAppointment) => {
    setEditingAppointment(appt);
    setTitle(appt.title);
    setType(appt.type);
    setDescription(appt.description || '');
    setDate(appt.date);
    setTime(appt.time);
    setDuration(appt.duration?.toString() || '');
    setLocation(appt.location || '');
    setAddress(appt.address || '');
    setWithPerson(appt.withPerson || '');
    setReminderEnabled(appt.reminderEnabled);
    setStatus(appt.status);
    setPreparationNotes(appt.preparationNotes || '');
    setNotes(appt.notes || '');
  };

  const resetForm = () => {
    setEditingAppointment(null);
    setTitle('');
    setType('doctor');
    setDescription('');
    setDate('');
    setTime('');
    setDuration('');
    setLocation('');
    setAddress('');
    setWithPerson('');
    setReminderEnabled(true);
    setStatus('scheduled');
    setPreparationNotes('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title for this appointment');
      return;
    }
    if (!date.trim()) {
      Alert.alert('Required', 'Please enter the appointment date');
      return;
    }
    if (!time.trim()) {
      Alert.alert('Required', 'Please enter the appointment time');
      return;
    }

    setIsSaving(true);
    try {
      const apptData: Omit<VaultAppointment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
        title: title.trim(),
        type,
        description: description.trim() || undefined,
        date: date.trim(),
        time: time.trim(),
        duration: duration ? parseInt(duration, 10) : undefined,
        location: location.trim() || undefined,
        address: address.trim() || undefined,
        withPerson: withPerson.trim() || undefined,
        reminderEnabled,
        status,
        preparationNotes: preparationNotes.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (editingAppointment) {
        await vaultService.updateAppointment(editingAppointment.id, apptData);
        Alert.alert('Saved', 'Appointment updated successfully');
      } else {
        await vaultService.addAppointment(apptData);
        Alert.alert('Saved', 'Appointment added successfully');
      }

      resetForm();
      setShowForm(false);
      loadAppointments();
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save appointment. Please try again.');
    }
    setIsSaving(false);
  };

  const handleDelete = (appt: VaultAppointment) => {
    Alert.alert(
      'Delete Appointment',
      `Are you sure you want to delete "${appt.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await vaultService.deleteAppointment(appt.id);
            loadAppointments();
          },
        },
      ]
    );
  };

  const handleEdit = (appt: VaultAppointment) => {
    populateForm(appt);
    setShowForm(true);
  };

  const getTypeLabel = (t: AppointmentType): string => {
    return APPOINTMENT_TYPES.find(at => at.value === t)?.label || t;
  };

  const getStatusColor = (s: VaultAppointment['status']): string => {
    switch (s) {
      case 'scheduled': return '#2196F3';
      case 'completed': return '#4CAF50';
      case 'cancelled': return '#F44336';
      case 'rescheduled': return '#FF9800';
      default: return '#666';
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header onClose={onClose} title="Appointments" />
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
        title={showForm ? (editingAppointment ? 'Edit Appointment' : 'Add Appointment') : 'Appointments'}
        showBack={showForm}
      />

      {!showForm ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultBigButton
            title="Add New Appointment"
            icon="➕"
            onPress={() => setShowForm(true)}
          />

          {appointments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📅</Text>
              <Text style={styles.emptyText}>No appointments yet</Text>
              <Text style={styles.emptySubtext}>
                Keep track of doctor visits, lab tests, and other appointments
              </Text>
            </View>
          ) : (
            appointments.map(appt => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                typeLabel={getTypeLabel(appt.type)}
                statusColor={getStatusColor(appt.status)}
                onEdit={() => handleEdit(appt)}
                onDelete={() => handleDelete(appt)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultFormInput
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g., Cardiology check-up"
            required
            icon="📋"
          />

          <VaultSelectButton
            label="Type"
            value={type}
            options={APPOINTMENT_TYPES}
            onSelect={(value) => setType(value as AppointmentType)}
            icon="📁"
          />

          <VaultFormInput
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="e.g., 15 Mar 2026"
            required
            icon="📅"
          />

          <VaultFormInput
            label="Time"
            value={time}
            onChangeText={setTime}
            placeholder="e.g., 10:30 AM"
            required
            icon="🕐"
          />

          <VaultFormInput
            label="Duration (minutes)"
            value={duration}
            onChangeText={setDuration}
            placeholder="e.g., 30"
            keyboardType="number-pad"
            icon="⏱️"
          />

          <VaultFormInput
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g., Apollo Hospital"
            icon="🏥"
          />

          <VaultFormInput
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="e.g., MG Road, Bengaluru"
            icon="📍"
          />

          <VaultFormInput
            label="With Person"
            value={withPerson}
            onChangeText={setWithPerson}
            placeholder="e.g., Dr. Sharma"
            icon="👤"
          />

          <VaultSelectButton
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onSelect={(value) => setStatus(value as VaultAppointment['status'])}
            icon="📊"
          />

          <VaultToggle
            label="Reminder"
            value={reminderEnabled}
            onToggle={setReminderEnabled}
            description="Get reminded before this appointment"
          />

          <VaultFormInput
            label="Preparation Notes"
            value={preparationNotes}
            onChangeText={setPreparationNotes}
            placeholder="e.g., Fasting required, bring reports"
            multiline
            numberOfLines={2}
            icon="📝"
          />

          <VaultFormInput
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes..."
            multiline
            numberOfLines={3}
            icon="📝"
          />

          <View style={styles.buttonContainer}>
            <VaultBigButton
              title={isSaving ? 'Saving...' : 'Save Appointment'}
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
function Header({ onClose, title, showBack }: { onClose: () => void; title: string; showBack?: boolean }): JSX.Element {
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

// Appointment Card
function AppointmentCard({ appointment, typeLabel, statusColor, onEdit, onDelete }: {
  appointment: VaultAppointment;
  typeLabel: string;
  statusColor: string;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{appointment.title}</Text>
          <Text style={styles.cardType}>{typeLabel}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {appointment.status}
          </Text>
        </View>
      </View>

      <Text style={styles.cardDateTime}>📅 {appointment.date} at {appointment.time}</Text>

      {appointment.location && (
        <Text style={styles.cardDetail}>📍 {appointment.location}</Text>
      )}

      {appointment.withPerson && (
        <Text style={styles.cardDetail}>👤 {appointment.withPerson}</Text>
      )}

      {appointment.preparationNotes && (
        <Text style={styles.cardPrep}>⚠️ {appointment.preparationNotes}</Text>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cardEditButton} onPress={onEdit}>
          <Text style={styles.cardEditText}>✏️ Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cardDeleteButton} onPress={onDelete}>
          <Text style={styles.cardDeleteText}>🗑️ Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  backButton: { padding: 8 },
  backButtonText: { fontSize: 18, color: '#2196F3', fontWeight: '600' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  placeholder: { width: 80 },
  content: { flex: 1 },
  contentContainer: { padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 22, fontWeight: '600', color: '#333', marginBottom: 8 },
  emptySubtext: { fontSize: 16, color: '#666', textAlign: 'center', paddingHorizontal: 40 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, ...Platform.select({ web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 } }) },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  cardType: { fontSize: 15, color: '#666', marginTop: 2 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  cardDateTime: { fontSize: 16, color: '#2196F3', fontWeight: '500', marginBottom: 4 },
  cardDetail: { fontSize: 15, color: '#666', marginBottom: 4 },
  cardPrep: { fontSize: 14, color: '#FF9800', fontWeight: '500', marginTop: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingTop: 12, marginTop: 8 },
  cardEditButton: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 12 },
  cardEditText: { fontSize: 16, color: '#2196F3', fontWeight: '600' },
  cardDeleteButton: { paddingHorizontal: 16, paddingVertical: 8 },
  cardDeleteText: { fontSize: 16, color: '#F44336', fontWeight: '600' },
  buttonContainer: { marginTop: 20 },
});

export default VaultAppointmentScreen;
