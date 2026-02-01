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
import { VaultContact, RelationshipType } from '../types/vault';
import {
  VaultFormInput,
  VaultSelectButton,
  VaultBigButton,
  VaultToggle,
} from './VaultFormInput';

interface VaultContactScreenProps {
  onClose: () => void;
  editContactId?: string;
}

const RELATIONSHIPS: { label: string; value: RelationshipType }[] = [
  { label: '💑 Spouse', value: 'spouse' },
  { label: '👦 Son', value: 'son' },
  { label: '👧 Daughter', value: 'daughter' },
  { label: '👶 Grandchild', value: 'grandchild' },
  { label: '👫 Sibling', value: 'sibling' },
  { label: '👴 Parent', value: 'parent' },
  { label: '🤝 Friend', value: 'friend' },
  { label: '🏠 Neighbor', value: 'neighbor' },
  { label: '🩺 Doctor', value: 'doctor' },
  { label: '💼 Caregiver', value: 'caregiver' },
  { label: '⚖️ Lawyer', value: 'lawyer' },
  { label: '🧮 Accountant', value: 'accountant' },
  { label: '🙋 Helper', value: 'helper' },
  { label: '📋 Other', value: 'other' },
];

export function VaultContactScreen({
  onClose,
  editContactId,
}: VaultContactScreenProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [contacts, setContacts] = useState<VaultContact[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<VaultContact | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipType>('friend');
  const [relationshipDetails, setRelationshipDetails] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneAlt, setPhoneAlt] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [birthday, setBirthday] = useState('');
  const [occupation, setOccupation] = useState('');
  const [caregiverAccess, setCaregiverAccess] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getContacts();
      setContacts(data);
      if (editContactId) {
        const contact = data.find(c => c.id === editContactId);
        if (contact) {
          populateForm(contact);
          setShowForm(true);
        }
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
    setIsLoading(false);
  };

  const populateForm = (contact: VaultContact) => {
    setEditingContact(contact);
    setName(contact.name);
    setRelationship(contact.relationship);
    setRelationshipDetails(contact.relationshipDetails || '');
    setNickname(contact.nickname || '');
    const primary = contact.phoneNumbers?.find(p => p.isPrimary) || contact.phoneNumbers?.[0];
    setPhone(primary?.number || '');
    const alt = contact.phoneNumbers?.find(p => !p.isPrimary && p !== primary);
    setPhoneAlt(alt?.number || '');
    setEmail(contact.email || '');
    setAddress(contact.address || '');
    setBirthday(contact.birthday || '');
    setOccupation(contact.occupation || '');
    setCaregiverAccess(contact.caregiverAccess || false);
    setNotes(contact.notes || '');
  };

  const resetForm = () => {
    setEditingContact(null);
    setName('');
    setRelationship('friend');
    setRelationshipDetails('');
    setNickname('');
    setPhone('');
    setPhoneAlt('');
    setEmail('');
    setAddress('');
    setBirthday('');
    setOccupation('');
    setCaregiverAccess(false);
    setNotes('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter the contact\'s name');
      return;
    }

    setIsSaving(true);
    try {
      const phoneNumbers: VaultContact['phoneNumbers'] = [];
      if (phone.trim()) {
        phoneNumbers.push({ label: 'mobile', number: phone.trim(), isPrimary: true });
      }
      if (phoneAlt.trim()) {
        phoneNumbers.push({ label: 'alternate', number: phoneAlt.trim(), isPrimary: false });
      }

      const contactData: Omit<VaultContact, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> = {
        name: name.trim(),
        relationship,
        relationshipDetails: relationshipDetails.trim() || undefined,
        nickname: nickname.trim() || undefined,
        phoneNumbers,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        birthday: birthday.trim() || undefined,
        occupation: occupation.trim() || undefined,
        caregiverAccess,
        notes: notes.trim() || undefined,
      };

      if (editingContact) {
        await vaultService.updateContact(editingContact.id, contactData);
        Alert.alert('Saved', 'Contact updated successfully');
      } else {
        await vaultService.addContact(contactData);
        Alert.alert('Saved', 'Contact added successfully');
      }

      resetForm();
      setShowForm(false);
      loadContacts();
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save contact. Please try again.');
    }
    setIsSaving(false);
  };

  const handleDelete = (contact: VaultContact) => {
    Alert.alert(
      'Delete Contact',
      `Are you sure you want to delete "${contact.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await vaultService.deleteContact(contact.id);
            loadContacts();
          },
        },
      ]
    );
  };

  const handleEdit = (contact: VaultContact) => {
    populateForm(contact);
    setShowForm(true);
  };

  const getRelationshipLabel = (rel: RelationshipType): string => {
    return RELATIONSHIPS.find(r => r.value === rel)?.label || rel;
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header onClose={onClose} title="Contacts" />
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
        title={showForm ? (editingContact ? 'Edit Contact' : 'Add Contact') : 'Contacts'}
        showBack={showForm}
      />

      {!showForm ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultBigButton
            title="Add New Contact"
            icon="➕"
            onPress={() => setShowForm(true)}
          />

          {contacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>No contacts yet</Text>
              <Text style={styles.emptySubtext}>
                Add family, friends, and important people for quick reference
              </Text>
            </View>
          ) : (
            contacts.map(contact => (
              <ContactCard
                key={contact.id}
                contact={contact}
                relationshipLabel={getRelationshipLabel(contact.relationship)}
                onEdit={() => handleEdit(contact)}
                onDelete={() => handleDelete(contact)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultFormInput
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g., Ravi Kumar"
            required
            icon="👤"
          />

          <VaultSelectButton
            label="Relationship"
            value={relationship}
            options={RELATIONSHIPS}
            onSelect={(value) => setRelationship(value as RelationshipType)}
            icon="🔗"
          />

          <VaultFormInput
            label="Relationship Details"
            value={relationshipDetails}
            onChangeText={setRelationshipDetails}
            placeholder="e.g., Eldest son, family doctor"
            icon="📋"
          />

          <VaultFormInput
            label="Nickname"
            value={nickname}
            onChangeText={setNickname}
            placeholder="e.g., Ravi beta"
            icon="💬"
          />

          <VaultFormInput
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g., 9876543210"
            keyboardType="phone-pad"
            icon="📱"
          />

          <VaultFormInput
            label="Alternate Phone"
            value={phoneAlt}
            onChangeText={setPhoneAlt}
            placeholder="e.g., 9876543211"
            keyboardType="phone-pad"
            icon="📞"
          />

          <VaultFormInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="e.g., ravi@email.com"
            keyboardType="email-address"
            icon="📧"
          />

          <VaultFormInput
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="e.g., 42, MG Road, Bengaluru"
            multiline
            numberOfLines={2}
            icon="🏠"
          />

          <VaultFormInput
            label="Birthday"
            value={birthday}
            onChangeText={setBirthday}
            placeholder="e.g., 15 Aug 1990"
            icon="🎂"
          />

          <VaultFormInput
            label="Occupation"
            value={occupation}
            onChangeText={setOccupation}
            placeholder="e.g., Software Engineer"
            icon="💼"
          />

          <VaultToggle
            label="Caregiver Access"
            value={caregiverAccess}
            onToggle={setCaregiverAccess}
            description="Allow this person to access care circle data"
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
              title={isSaving ? 'Saving...' : 'Save Contact'}
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

// Contact Card
function ContactCard({ contact, relationshipLabel, onEdit, onDelete }: {
  contact: VaultContact;
  relationshipLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const primaryPhone = contact.phoneNumbers?.find(p => p.isPrimary) || contact.phoneNumbers?.[0];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>👤</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{contact.name}</Text>
          <Text style={styles.cardRelationship}>{relationshipLabel}</Text>
        </View>
        {contact.caregiverAccess && (
          <View style={styles.caregiverBadge}>
            <Text style={styles.caregiverBadgeText}>Caregiver</Text>
          </View>
        )}
      </View>

      {primaryPhone && (
        <Text style={styles.cardDetail}>📱 {primaryPhone.number}</Text>
      )}

      {contact.email && (
        <Text style={styles.cardDetail}>📧 {contact.email}</Text>
      )}

      {contact.address && (
        <Text style={styles.cardDetail}>🏠 {contact.address}</Text>
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
  cardRelationship: { fontSize: 15, color: '#666', marginTop: 2 },
  cardDetail: { fontSize: 15, color: '#666', marginBottom: 4 },
  caregiverBadge: { backgroundColor: '#E3F2FD', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  caregiverBadgeText: { fontSize: 12, color: '#2196F3', fontWeight: '600' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingTop: 12, marginTop: 8 },
  cardEditButton: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 12 },
  cardEditText: { fontSize: 16, color: '#2196F3', fontWeight: '600' },
  cardDeleteButton: { paddingHorizontal: 16, paddingVertical: 8 },
  cardDeleteText: { fontSize: 16, color: '#F44336', fontWeight: '600' },
  buttonContainer: { marginTop: 20 },
});

export default VaultContactScreen;
