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
import { VaultDoctor, DoctorSpecialty } from '../types/vault';
import {
  VaultFormInput,
  VaultSelectButton,
  VaultBigButton,
} from './VaultFormInput';

interface VaultDoctorScreenProps {
  onClose: () => void;
  editDoctorId?: string;
}

const SPECIALTIES: { label: string; value: DoctorSpecialty }[] = [
  { label: '🩺 General Physician', value: 'general_physician' },
  { label: '❤️ Cardiologist', value: 'cardiologist' },
  { label: '🧠 Neurologist', value: 'neurologist' },
  { label: '🦴 Orthopedic', value: 'orthopedic' },
  { label: '👁️ Ophthalmologist', value: 'ophthalmologist' },
  { label: '👂 ENT', value: 'ent' },
  { label: '🦷 Dentist', value: 'dentist' },
  { label: '🧴 Dermatologist', value: 'dermatologist' },
  { label: '🧘 Psychiatrist', value: 'psychiatrist' },
  { label: '💪 Physiotherapist', value: 'physiotherapist' },
  { label: '📋 Other', value: 'other' },
];

export function VaultDoctorScreen({
  onClose,
  editDoctorId,
}: VaultDoctorScreenProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [doctors, setDoctors] = useState<VaultDoctor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<VaultDoctor | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState<DoctorSpecialty>('general_physician');
  const [specialtyOther, setSpecialtyOther] = useState('');
  const [clinic, setClinic] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [consultationDays, setConsultationDays] = useState('');
  const [consultationHours, setConsultationHours] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [lastVisit, setLastVisit] = useState('');
  const [nextVisit, setNextVisit] = useState('');
  const [treatingConditions, setTreatingConditions] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctors = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getDoctors();
      setDoctors(data);
      if (editDoctorId) {
        const doctor = data.find(d => d.id === editDoctorId);
        if (doctor) {
          populateForm(doctor);
          setShowForm(true);
        }
      }
    } catch (error) {
      console.error('Failed to load doctors:', error);
    }
    setIsLoading(false);
  };

  const populateForm = (doctor: VaultDoctor) => {
    setEditingDoctor(doctor);
    setName(doctor.name);
    setSpecialty(doctor.specialty);
    setSpecialtyOther(doctor.specialtyOther || '');
    setClinic(doctor.clinic);
    setClinicAddress(doctor.clinicAddress || '');
    setPhone(doctor.phoneNumbers?.[0] || '');
    setEmail(doctor.email || '');
    setConsultationDays(doctor.consultationDays || '');
    setConsultationHours(doctor.consultationHours || '');
    setConsultationFee(doctor.consultationFee || '');
    setLastVisit(doctor.lastVisit || '');
    setNextVisit(doctor.nextVisit || '');
    setTreatingConditions(doctor.treatingConditions?.join(', ') || '');
    setNotes(doctor.notes || '');
  };

  const resetForm = () => {
    setEditingDoctor(null);
    setName('');
    setSpecialty('general_physician');
    setSpecialtyOther('');
    setClinic('');
    setClinicAddress('');
    setPhone('');
    setEmail('');
    setConsultationDays('');
    setConsultationHours('');
    setConsultationFee('');
    setLastVisit('');
    setNextVisit('');
    setTreatingConditions('');
    setNotes('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter the doctor\'s name');
      return;
    }
    if (!clinic.trim()) {
      Alert.alert('Required', 'Please enter the clinic or hospital name');
      return;
    }

    setIsSaving(true);
    try {
      const doctorData: Omit<VaultDoctor, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
        name: name.trim(),
        specialty,
        specialtyOther: specialty === 'other' ? specialtyOther.trim() : undefined,
        clinic: clinic.trim(),
        clinicAddress: clinicAddress.trim() || undefined,
        phoneNumbers: phone.trim() ? [phone.trim()] : [],
        email: email.trim() || undefined,
        consultationDays: consultationDays.trim() || undefined,
        consultationHours: consultationHours.trim() || undefined,
        consultationFee: consultationFee.trim() || undefined,
        lastVisit: lastVisit.trim() || undefined,
        nextVisit: nextVisit.trim() || undefined,
        treatingConditions: treatingConditions.trim()
          ? treatingConditions.split(',').map(c => c.trim()).filter(Boolean)
          : undefined,
        notes: notes.trim() || undefined,
      };

      if (editingDoctor) {
        await vaultService.updateDoctor(editingDoctor.id, doctorData);
        Alert.alert('Saved', 'Doctor updated successfully');
      } else {
        await vaultService.addDoctor(doctorData);
        Alert.alert('Saved', 'Doctor added successfully');
      }

      resetForm();
      setShowForm(false);
      loadDoctors();
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save doctor. Please try again.');
    }
    setIsSaving(false);
  };

  const handleDelete = (doctor: VaultDoctor) => {
    Alert.alert(
      'Delete Doctor',
      `Are you sure you want to delete Dr. ${doctor.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await vaultService.deleteDoctor(doctor.id);
            loadDoctors();
          },
        },
      ]
    );
  };

  const handleEdit = (doctor: VaultDoctor) => {
    populateForm(doctor);
    setShowForm(true);
  };

  const getSpecialtyLabel = (spec: DoctorSpecialty): string => {
    return SPECIALTIES.find(s => s.value === spec)?.label || spec;
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header onClose={onClose} title="Doctors" />
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
        title={showForm ? (editingDoctor ? 'Edit Doctor' : 'Add Doctor') : 'Doctors'}
        showBack={showForm}
      />

      {!showForm ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultBigButton
            title="Add New Doctor"
            icon="➕"
            onPress={() => setShowForm(true)}
          />

          {doctors.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👨‍⚕️</Text>
              <Text style={styles.emptyText}>No doctors yet</Text>
              <Text style={styles.emptySubtext}>
                Add your doctors and healthcare providers for quick reference
              </Text>
            </View>
          ) : (
            doctors.map(doctor => (
              <DoctorCard
                key={doctor.id}
                doctor={doctor}
                specialtyLabel={getSpecialtyLabel(doctor.specialty)}
                onEdit={() => handleEdit(doctor)}
                onDelete={() => handleDelete(doctor)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultFormInput
            label="Doctor's Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g., Dr. Sharma"
            required
            icon="👨‍⚕️"
          />

          <VaultSelectButton
            label="Specialty"
            value={specialty}
            options={SPECIALTIES}
            onSelect={(value) => setSpecialty(value as DoctorSpecialty)}
            icon="🩺"
          />

          {specialty === 'other' && (
            <VaultFormInput
              label="Specialty (specify)"
              value={specialtyOther}
              onChangeText={setSpecialtyOther}
              placeholder="e.g., Gastroenterologist"
              icon="📋"
            />
          )}

          <VaultFormInput
            label="Clinic / Hospital"
            value={clinic}
            onChangeText={setClinic}
            placeholder="e.g., Apollo Hospital"
            required
            icon="🏥"
          />

          <VaultFormInput
            label="Clinic Address"
            value={clinicAddress}
            onChangeText={setClinicAddress}
            placeholder="e.g., MG Road, Bengaluru"
            icon="📍"
          />

          <VaultFormInput
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g., 9876543210"
            keyboardType="phone-pad"
            icon="📞"
          />

          <VaultFormInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="e.g., dr.sharma@hospital.com"
            keyboardType="email-address"
            icon="📧"
          />

          <VaultFormInput
            label="Consultation Days"
            value={consultationDays}
            onChangeText={setConsultationDays}
            placeholder="e.g., Mon-Fri"
            icon="📅"
          />

          <VaultFormInput
            label="Consultation Hours"
            value={consultationHours}
            onChangeText={setConsultationHours}
            placeholder="e.g., 10 AM - 2 PM"
            icon="🕐"
          />

          <VaultFormInput
            label="Consultation Fee"
            value={consultationFee}
            onChangeText={setConsultationFee}
            placeholder="e.g., ₹500"
            icon="💰"
          />

          <VaultFormInput
            label="Last Visit"
            value={lastVisit}
            onChangeText={setLastVisit}
            placeholder="e.g., 15 Jan 2026"
            icon="📆"
          />

          <VaultFormInput
            label="Next Visit"
            value={nextVisit}
            onChangeText={setNextVisit}
            placeholder="e.g., 15 Apr 2026"
            icon="📆"
          />

          <VaultFormInput
            label="Treating Conditions"
            value={treatingConditions}
            onChangeText={setTreatingConditions}
            placeholder="e.g., Diabetes, Blood Pressure"
            icon="💊"
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
              title={isSaving ? 'Saving...' : 'Save Doctor'}
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

// Doctor Card component
function DoctorCard({ doctor, specialtyLabel, onEdit, onDelete }: {
  doctor: VaultDoctor;
  specialtyLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>👨‍⚕️</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>Dr. {doctor.name}</Text>
          <Text style={styles.cardSpecialty}>{specialtyLabel}</Text>
        </View>
      </View>

      <Text style={styles.cardClinic}>🏥 {doctor.clinic}</Text>

      {doctor.phoneNumbers?.[0] && (
        <Text style={styles.cardDetail}>📞 {doctor.phoneNumbers[0]}</Text>
      )}

      {doctor.consultationDays && (
        <Text style={styles.cardDetail}>📅 {doctor.consultationDays} {doctor.consultationHours ? `• ${doctor.consultationHours}` : ''}</Text>
      )}

      {doctor.nextVisit && (
        <Text style={styles.cardNextVisit}>Next visit: {doctor.nextVisit}</Text>
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
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardEmoji: { fontSize: 40, marginRight: 16 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  cardSpecialty: { fontSize: 15, color: '#666', marginTop: 2 },
  cardClinic: { fontSize: 16, color: '#444', marginBottom: 4 },
  cardDetail: { fontSize: 15, color: '#666', marginBottom: 4 },
  cardNextVisit: { fontSize: 15, color: '#2196F3', fontWeight: '500', marginTop: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingTop: 12, marginTop: 8 },
  cardEditButton: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 12 },
  cardEditText: { fontSize: 16, color: '#2196F3', fontWeight: '600' },
  cardDeleteButton: { paddingHorizontal: 16, paddingVertical: 8 },
  cardDeleteText: { fontSize: 16, color: '#F44336', fontWeight: '600' },
  buttonContainer: { marginTop: 20 },
});

export default VaultDoctorScreen;
