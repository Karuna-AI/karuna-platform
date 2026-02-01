import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';
import { auditLogService } from './auditLog';
import { consentService } from './consent';
import { MedicalRecord, MedicalRecordType, MEDICAL_RECORD_CATEGORIES } from '../types/health';

const STORAGE_KEYS = {
  RECORDS: '@karuna_medical_records',
};

const DOCUMENTS_DIR = Platform.OS !== 'web' ? `${FileSystem.documentDirectory}medical_records/` : '';

/**
 * Medical Records Service
 * Handles upload, storage, tagging, and retrieval of medical documents
 */
class MedicalRecordsService {
  private records: MedicalRecord[] = [];
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure documents directory exists (native only)
      if (Platform.OS !== 'web') {
        const dirInfo = await FileSystem.getInfoAsync(DOCUMENTS_DIR);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(DOCUMENTS_DIR, { intermediates: true });
        }
      }

      // Load stored records
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.RECORDS);
      if (stored) {
        this.records = JSON.parse(stored);
      }

      this.isInitialized = true;
      console.log('[MedicalRecords] Initialized with', this.records.length, 'records');
    } catch (error) {
      console.error('[MedicalRecords] Initialization error:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Pick a document from the device
   */
  async pickDocument(): Promise<{
    uri: string;
    name: string;
    size: number;
    mimeType: string;
  } | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      return {
        uri: asset.uri,
        name: asset.name,
        size: asset.size || 0,
        mimeType: asset.mimeType || 'application/octet-stream',
      };
    } catch (error) {
      console.error('[MedicalRecords] Document pick error:', error);
      return null;
    }
  }

  /**
   * Upload and store a medical record
   */
  async uploadRecord(params: {
    title: string;
    type: MedicalRecordType;
    category: string;
    date: string;
    provider?: string;
    description?: string;
    tags?: string[];
    isConfidential?: boolean;
    documentUri?: string;
    documentName?: string;
    documentSize?: number;
    documentMimeType?: string;
  }): Promise<MedicalRecord> {
    // Check consent for storing medical documents
    const hasConsent = consentService.hasConsent('personal_documents', 'app', 'write');
    if (!hasConsent) {
      throw new Error('Consent not granted for storing medical documents');
    }

    const recordId = `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let fileUri: string | undefined;
    let thumbnail: string | undefined;

    // Copy document to app storage if provided (native only)
    if (params.documentUri && Platform.OS !== 'web') {
      try {
        const extension = params.documentName?.split('.').pop() || 'pdf';
        const destPath = `${DOCUMENTS_DIR}${recordId}.${extension}`;

        await FileSystem.copyAsync({
          from: params.documentUri,
          to: destPath,
        });

        fileUri = destPath;

        // Generate thumbnail for images
        if (params.documentMimeType?.startsWith('image/')) {
          thumbnail = destPath; // Use the image itself as thumbnail
        }
      } catch (error) {
        console.error('[MedicalRecords] File copy error:', error);
        throw new Error('Failed to save document');
      }
    }

    const record: MedicalRecord = {
      id: recordId,
      title: params.title,
      type: params.type,
      category: params.category,
      date: params.date,
      provider: params.provider,
      description: params.description,
      fileUri,
      fileName: params.documentName,
      fileSize: params.documentSize,
      mimeType: params.documentMimeType,
      thumbnail,
      tags: params.tags || [],
      isConfidential: params.isConfidential || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.records.unshift(record);
    await this.saveRecords();

    await auditLogService.logVaultAccess({
      action: 'created',
      entityType: 'medical_record',
      entityId: record.id,
      entityName: record.title,
    });

    return record;
  }

  /**
   * Update a medical record
   */
  async updateRecord(
    id: string,
    updates: Partial<Omit<MedicalRecord, 'id' | 'createdAt'>>
  ): Promise<MedicalRecord | null> {
    const index = this.records.findIndex((r) => r.id === id);
    if (index === -1) return null;

    const updated = {
      ...this.records[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.records[index] = updated;
    await this.saveRecords();

    await auditLogService.logVaultAccess({
      action: 'updated',
      entityType: 'medical_record',
      entityId: id,
      entityName: updated.title,
    });

    return updated;
  }

  /**
   * Delete a medical record
   */
  async deleteRecord(id: string): Promise<boolean> {
    const index = this.records.findIndex((r) => r.id === id);
    if (index === -1) return false;

    const record = this.records[index];

    // Delete the file if it exists (native only)
    if (record.fileUri && Platform.OS !== 'web') {
      try {
        await FileSystem.deleteAsync(record.fileUri, { idempotent: true });
      } catch (error) {
        console.error('[MedicalRecords] File delete error:', error);
      }
    }

    this.records.splice(index, 1);
    await this.saveRecords();

    await auditLogService.logVaultAccess({
      action: 'deleted',
      entityType: 'medical_record',
      entityId: id,
      entityName: record.title,
    });

    return true;
  }

  /**
   * Get all records
   */
  getRecords(options?: {
    type?: MedicalRecordType;
    category?: string;
    tags?: string[];
    confidentialOnly?: boolean;
    limit?: number;
  }): MedicalRecord[] {
    let filtered = [...this.records];

    if (options?.type) {
      filtered = filtered.filter((r) => r.type === options.type);
    }

    if (options?.category) {
      filtered = filtered.filter((r) => r.category === options.category);
    }

    if (options?.tags && options.tags.length > 0) {
      filtered = filtered.filter((r) =>
        options.tags!.some((tag) => r.tags.includes(tag))
      );
    }

    if (options?.confidentialOnly) {
      filtered = filtered.filter((r) => r.isConfidential);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * Get record by ID
   */
  getRecordById(id: string): MedicalRecord | null {
    return this.records.find((r) => r.id === id) || null;
  }

  /**
   * Search records
   */
  searchRecords(query: string): MedicalRecord[] {
    const lowerQuery = query.toLowerCase();
    return this.records.filter(
      (r) =>
        r.title.toLowerCase().includes(lowerQuery) ||
        r.description?.toLowerCase().includes(lowerQuery) ||
        r.provider?.toLowerCase().includes(lowerQuery) ||
        r.tags.some((t) => t.toLowerCase().includes(lowerQuery)) ||
        r.summary?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get records by date range
   */
  getRecordsByDateRange(startDate: string, endDate: string): MedicalRecord[] {
    return this.records.filter((r) => r.date >= startDate && r.date <= endDate);
  }

  /**
   * Add tags to a record
   */
  async addTags(id: string, tags: string[]): Promise<MedicalRecord | null> {
    const record = this.getRecordById(id);
    if (!record) return null;

    const uniqueTags = [...new Set([...record.tags, ...tags])];
    return this.updateRecord(id, { tags: uniqueTags });
  }

  /**
   * Remove tags from a record
   */
  async removeTags(id: string, tags: string[]): Promise<MedicalRecord | null> {
    const record = this.getRecordById(id);
    if (!record) return null;

    const remainingTags = record.tags.filter((t) => !tags.includes(t));
    return this.updateRecord(id, { tags: remainingTags });
  }

  /**
   * Get all unique tags
   */
  getAllTags(): string[] {
    const tagSet = new Set<string>();
    this.records.forEach((r) => r.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }

  /**
   * Get records summary for AI queries
   */
  getRecordsSummary(): string {
    if (this.records.length === 0) {
      return 'No medical records stored.';
    }

    const byType: Record<string, number> = {};
    this.records.forEach((r) => {
      byType[r.type] = (byType[r.type] || 0) + 1;
    });

    const lines = Object.entries(byType).map(([type, count]) => {
      const info = MEDICAL_RECORD_CATEGORIES[type as MedicalRecordType];
      return `- ${info?.displayName || type}: ${count} document${count !== 1 ? 's' : ''}`;
    });

    const recentRecords = this.records.slice(0, 3);
    const recentLines = recentRecords.map(
      (r) => `- ${r.title} (${r.date})${r.summary ? `: ${r.summary}` : ''}`
    );

    return `Medical records summary:\n${lines.join('\n')}\n\nRecent records:\n${recentLines.join('\n')}`;
  }

  /**
   * Store AI-generated summary for a record
   */
  async storeSummary(id: string, summary: string, extractedData?: Record<string, unknown>): Promise<MedicalRecord | null> {
    return this.updateRecord(id, { summary, extractedData });
  }

  /**
   * Get record file content as base64 (for AI analysis)
   */
  async getRecordFileContent(id: string): Promise<{
    content: string;
    mimeType: string;
  } | null> {
    const record = this.getRecordById(id);
    if (!record || !record.fileUri) return null;

    // Check consent for AI access to documents
    const hasConsent = consentService.hasConsent('personal_documents', 'ai_assistant', 'read');
    if (!hasConsent) {
      throw new Error('Consent not granted for AI access to medical documents');
    }

    if (Platform.OS === 'web') {
      return null;
    }

    try {
      const content = await FileSystem.readAsStringAsync(record.fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await auditLogService.log({
        action: 'ai_query_executed',
        category: 'ai',
        description: `AI accessed medical record: ${record.title}`,
        entityType: 'medical_record',
        entityId: id,
      });

      return {
        content,
        mimeType: record.mimeType || 'application/octet-stream',
      };
    } catch (error) {
      console.error('[MedicalRecords] File read error:', error);
      return null;
    }
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<{
    totalRecords: number;
    totalSize: number;
    byType: Record<string, { count: number; size: number }>;
  }> {
    const byType: Record<string, { count: number; size: number }> = {};
    let totalSize = 0;

    this.records.forEach((r) => {
      const size = r.fileSize || 0;
      totalSize += size;

      if (!byType[r.type]) {
        byType[r.type] = { count: 0, size: 0 };
      }
      byType[r.type].count++;
      byType[r.type].size += size;
    });

    return {
      totalRecords: this.records.length,
      totalSize,
      byType,
    };
  }

  /**
   * Export records metadata (for backup)
   */
  exportRecords(): MedicalRecord[] {
    return [...this.records];
  }

  /**
   * Clear all records (with confirmation)
   */
  async clearAllRecords(): Promise<void> {
    // Delete all files (native only)
    if (Platform.OS !== 'web') {
      for (const record of this.records) {
        if (record.fileUri) {
          try {
            await FileSystem.deleteAsync(record.fileUri, { idempotent: true });
          } catch (error) {
            console.error('[MedicalRecords] File delete error:', error);
          }
        }
      }
    }

    this.records = [];
    await this.saveRecords();

    await auditLogService.log({
      action: 'data_deleted',
      category: 'data_modification',
      description: 'All medical records cleared',
    });
  }

  private async saveRecords(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(this.records));
    } catch (error) {
      console.error('[MedicalRecords] Save records error:', error);
    }
  }
}

export const medicalRecordsService = new MedicalRecordsService();
export default medicalRecordsService;
