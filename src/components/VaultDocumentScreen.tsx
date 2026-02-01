import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { vaultService } from '../services/vault';
import { VaultDocument, DocumentCategory } from '../types/vault';
import {
  VaultFormInput,
  VaultSelectButton,
  VaultBigButton,
  VaultToggle,
} from './VaultFormInput';

interface VaultDocumentScreenProps {
  onClose: () => void;
}

const DOCUMENT_CATEGORIES: { label: string; value: DocumentCategory }[] = [
  { label: '🪪 ID Proof', value: 'id_proof' },
  { label: '📍 Address Proof', value: 'address_proof' },
  { label: '🏥 Medical', value: 'medical' },
  { label: '🛡️ Insurance', value: 'insurance' },
  { label: '🏦 Bank', value: 'bank' },
  { label: '🏠 Property', value: 'property' },
  { label: '⚖️ Legal', value: 'legal' },
  { label: '📋 Prescription', value: 'prescription' },
  { label: '🔬 Lab Report', value: 'lab_report' },
  { label: '📷 Photo', value: 'photo' },
  { label: '📄 Other', value: 'other' },
];

export function VaultDocumentScreen({
  onClose,
}: VaultDocumentScreenProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<VaultDocument | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('id_proof');
  const [description, setDescription] = useState('');
  const [physicalLocation, setPhysicalLocation] = useState('');
  const [hasPhysicalCopy, setHasPhysicalCopy] = useState(true);
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await vaultService.getDocuments();
      setDocuments(data);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
    setIsLoading(false);
  };

  const populateForm = (doc: VaultDocument) => {
    setEditingDoc(doc);
    setName(doc.name);
    setCategory(doc.category);
    setDescription(doc.description || '');
    setPhysicalLocation(doc.physicalLocation || '');
    setHasPhysicalCopy(doc.physicalCopy ?? true);
    setIssueDate(doc.issueDate || '');
    setExpiryDate(doc.expiryDate || '');
    setNotes(doc.notes || '');
    setCapturedImage(doc.filePath || null);
  };

  const resetForm = () => {
    setEditingDoc(null);
    setName('');
    setCategory('id_proof');
    setDescription('');
    setPhysicalLocation('');
    setHasPhysicalCopy(true);
    setIssueDate('');
    setExpiryDate('');
    setNotes('');
    setCapturedImage(null);
  };

  const handleCaptureImage = async () => {
    Alert.alert(
      'Capture Document',
      'How would you like to add the document?',
      [
        {
          text: 'Take Photo',
          onPress: () => launchCamera(),
        },
        {
          text: 'Choose from Gallery',
          onPress: () => launchGallery(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const launchCamera = async () => {
    try {
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Camera permission is needed to take photos. Please enable it in your device settings.'
        );
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Failed to capture image. Please try again.');
    }
  };

  const launchGallery = async () => {
    try {
      // Request media library permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Photo library permission is needed to select images. Please enable it in your device settings.'
        );
        return;
      }

      // Launch image library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setCapturedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter the document name');
      return;
    }

    setIsSaving(true);
    try {
      const docData = {
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        physicalLocation: physicalLocation.trim() || undefined,
        physicalCopy: hasPhysicalCopy,
        issueDate: issueDate.trim() || undefined,
        expiryDate: expiryDate.trim() || undefined,
        notes: notes.trim() || undefined,
        filePath: capturedImage || undefined,
        isEncrypted: true,
      };

      if (editingDoc) {
        await vaultService.updateDocument(editingDoc.id, docData);
        Alert.alert('Saved', 'Document updated successfully');
      } else {
        await vaultService.addDocument(docData);
        Alert.alert('Saved', 'Document added successfully');
      }

      resetForm();
      setShowForm(false);
      loadDocuments();
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save document. Please try again.');
    }
    setIsSaving(false);
  };

  const handleDelete = (doc: VaultDocument) => {
    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete "${doc.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await vaultService.deleteDocument(doc.id);
            loadDocuments();
          },
        },
      ]
    );
  };

  const handleEdit = (doc: VaultDocument) => {
    populateForm(doc);
    setShowForm(true);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header onClose={onClose} title="Documents" />
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
        title={showForm ? (editingDoc ? 'Edit Document' : 'Add Document') : 'Documents'}
        showBack={showForm}
      />

      {!showForm ? (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <VaultBigButton
            title="Add New Document"
            icon="➕"
            onPress={() => setShowForm(true)}
          />

          {documents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📄</Text>
              <Text style={styles.emptyText}>No documents yet</Text>
              <Text style={styles.emptySubtext}>
                Store important document information and their locations
              </Text>
            </View>
          ) : (
            // Group documents by category
            <>
              {DOCUMENT_CATEGORIES.map(cat => {
                const catDocs = documents.filter(d => d.category === cat.value);
                if (catDocs.length === 0) return null;

                return (
                  <View key={cat.value}>
                    <Text style={styles.sectionTitle}>{cat.label}</Text>
                    {catDocs.map(doc => (
                      <DocumentCard
                        key={doc.id}
                        document={doc}
                        onEdit={() => handleEdit(doc)}
                        onDelete={() => handleDelete(doc)}
                      />
                    ))}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Document Capture Section */}
          <View style={styles.captureSection}>
            <Text style={styles.captureSectionTitle}>📷 Document Image</Text>

            {capturedImage ? (
              <View style={styles.capturedImageContainer}>
                <View style={styles.capturedImagePlaceholder}>
                  <Text style={styles.capturedImageText}>✓ Image Captured</Text>
                </View>
                <TouchableOpacity
                  style={styles.recaptureButton}
                  onPress={handleCaptureImage}
                >
                  <Text style={styles.recaptureButtonText}>📷 Replace Image</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.captureButtons}>
                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={handleCaptureImage}
                >
                  <Text style={styles.captureButtonIcon}>📷</Text>
                  <Text style={styles.captureButtonText}>Take Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.captureButton}
                  onPress={handleCaptureImage}
                >
                  <Text style={styles.captureButtonIcon}>🖼️</Text>
                  <Text style={styles.captureButtonText}>Choose Photo</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.captureHint}>
              Optional: Take a photo or scan of your document
            </Text>
          </View>

          <VaultSelectButton
            label="Document Category"
            value={category}
            options={DOCUMENT_CATEGORIES}
            onSelect={(value) => setCategory(value as DocumentCategory)}
            icon="📁"
          />

          <VaultFormInput
            label="Document Name"
            value={name}
            onChangeText={setName}
            placeholder="e.g., Aadhaar Card, Property Deed"
            required
            icon="📝"
          />

          <VaultFormInput
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Brief description..."
            icon="📋"
          />

          <VaultToggle
            label="Has physical copy"
            value={hasPhysicalCopy}
            onToggle={setHasPhysicalCopy}
            description="Do you have a physical copy of this document?"
          />

          {hasPhysicalCopy && (
            <VaultFormInput
              label="Physical Location"
              value={physicalLocation}
              onChangeText={setPhysicalLocation}
              placeholder="e.g., Bedroom almirah, top shelf, blue folder"
              icon="📍"
            />
          )}

          <VaultFormInput
            label="Issue Date"
            value={issueDate}
            onChangeText={setIssueDate}
            placeholder="e.g., 15 Jan 2020"
            icon="📅"
          />

          <VaultFormInput
            label="Expiry Date"
            value={expiryDate}
            onChangeText={setExpiryDate}
            placeholder="e.g., 15 Jan 2030 (if applicable)"
            icon="⏰"
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
              title={isSaving ? 'Saving...' : 'Save Document'}
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

// Document Card component
interface DocumentCardProps {
  document: VaultDocument;
  onEdit: () => void;
  onDelete: () => void;
}

function DocumentCard({ document, onEdit, onDelete }: DocumentCardProps): JSX.Element {
  const categoryEmoji = {
    id_proof: '🪪',
    address_proof: '📍',
    medical: '🏥',
    insurance: '🛡️',
    bank: '🏦',
    property: '🏠',
    legal: '⚖️',
    prescription: '📋',
    lab_report: '🔬',
    photo: '📷',
    other: '📄',
  }[document.category] || '📄';

  const isExpired = document.expiryDate && new Date(document.expiryDate) < new Date();
  const isExpiringSoon = document.expiryDate && !isExpired &&
    new Date(document.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardEmoji}>{categoryEmoji}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{document.name}</Text>
          {document.description && (
            <Text style={styles.cardDescription}>{document.description}</Text>
          )}
        </View>
        {document.filePath && (
          <View style={styles.imageBadge}>
            <Text style={styles.imageBadgeText}>📷</Text>
          </View>
        )}
      </View>

      {document.physicalLocation && (
        <View style={styles.locationBox}>
          <Text style={styles.locationLabel}>📍 Location:</Text>
          <Text style={styles.locationText}>{document.physicalLocation}</Text>
        </View>
      )}

      <View style={styles.cardDates}>
        {document.issueDate && (
          <Text style={styles.cardDate}>Issued: {document.issueDate}</Text>
        )}
        {document.expiryDate && (
          <Text style={[
            styles.cardDate,
            isExpired && styles.expiredText,
            isExpiringSoon && styles.expiringSoonText,
          ]}>
            {isExpired ? '⚠️ Expired: ' : isExpiringSoon ? '⏰ Expires: ' : 'Expires: '}
            {document.expiryDate}
          </Text>
        )}
      </View>

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

  // Capture section
  captureSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  captureSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  captureButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  captureButton: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#E3F2FD',
    borderRadius: 16,
    width: '45%',
  },
  captureButtonIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  captureButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
  },
  capturedImageContainer: {
    alignItems: 'center',
  },
  capturedImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  capturedImageText: {
    fontSize: 20,
    color: '#4CAF50',
    fontWeight: '600',
  },
  recaptureButton: {
    padding: 12,
  },
  recaptureButtonText: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '600',
  },
  captureHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
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
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  imageBadge: {
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 8,
  },
  imageBadgeText: {
    fontSize: 16,
  },
  locationBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  locationLabel: {
    fontSize: 14,
    color: '#E65100',
    fontWeight: '600',
    marginBottom: 4,
  },
  locationText: {
    fontSize: 16,
    color: '#333',
  },
  cardDates: {
    marginBottom: 12,
  },
  cardDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  expiredText: {
    color: '#F44336',
    fontWeight: '600',
  },
  expiringSoonText: {
    color: '#FF9800',
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
    marginTop: 8,
  },
  cardEditButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  cardEditText: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '600',
  },
  cardDeleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardDeleteText: {
    fontSize: 16,
    color: '#F44336',
    fontWeight: '600',
  },

  buttonContainer: {
    marginTop: 20,
  },
});

export default VaultDocumentScreen;
