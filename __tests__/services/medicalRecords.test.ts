/**
 * Medical Records Service Tests
 *
 * Exercises the real MedicalRecordsService API: CRUD, filtering, search,
 * tags, storage persistence, and consent guard.
 */

// ─── module mocks ─────────────────────────────────────────────────────────────

const _store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(_store[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => { _store[key] = value; return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { delete _store[key]; return Promise.resolve(); }),
    clear: jest.fn(() => { Object.keys(_store).forEach(k => delete _store[k]); return Promise.resolve(); }),
  },
}));

// expo-file-system/legacy — stub so file-copy/delete don't actually run
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue('base64content=='),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('../../src/services/auditLog', () => ({
  auditLogService: {
    log: jest.fn().mockResolvedValue(undefined),
    logVaultAccess: jest.fn().mockResolvedValue(undefined),
  },
}));

// Default: consent granted. Override per-test with mockReturnValueOnce(false).
jest.mock('../../src/services/consent', () => ({
  consentService: {
    hasConsent: jest.fn().mockReturnValue(true),
  },
}));

// ─── imports ──────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { medicalRecordsService as svc } from '../../src/services/medicalRecords';

// ─── helpers ──────────────────────────────────────────────────────────────────

function clearStore() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

function resetService() {
  const s = svc as any;
  s.records = [];
  s.isInitialized = false;
}

function buildRecordParams(overrides: Record<string, any> = {}) {
  return {
    title: 'Blood Test Results',
    type: 'lab_report' as const,
    category: 'diagnostics',
    date: '2026-03-15',
    provider: 'Dr. Sharma',
    description: 'Annual blood panel',
    tags: ['annual', 'blood'],
    isConfidential: false,
    ...overrides,
  };
}

// ─── initialization ───────────────────────────────────────────────────────────

describe('MedicalRecordsService – initialization', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
  });

  it('loads stored records from AsyncStorage', async () => {
    const stored = [
      {
        id: 'record_1',
        title: 'Chest X-Ray',
        type: 'imaging',
        category: 'radiology',
        date: '2026-01-10',
        tags: [],
        isConfidential: false,
        createdAt: '2026-01-10T10:00:00Z',
        updatedAt: '2026-01-10T10:00:00Z',
      },
    ];
    _store['@karuna_medical_records'] = JSON.stringify(stored);

    await svc.initialize();

    expect(svc.getRecords()).toHaveLength(1);
    expect(svc.getRecords()[0].title).toBe('Chest X-Ray');
  });

  it('sets isInitialized=true even when AsyncStorage throws', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('disk error'));

    await svc.initialize();

    expect((svc as any).isInitialized).toBe(true);
  });

  it('does not re-initialize once already initialized', async () => {
    (svc as any).isInitialized = true;
    const spy = jest.spyOn(AsyncStorage, 'getItem');

    await svc.initialize();

    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── uploadRecord ─────────────────────────────────────────────────────────────

describe('MedicalRecordsService – uploadRecord', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns a record with generated id, createdAt, updatedAt', async () => {
    const record = await svc.uploadRecord(buildRecordParams());

    expect(record.id).toMatch(/^record_/);
    expect(record.createdAt).toBeTruthy();
    expect(record.updatedAt).toBeTruthy();
    expect(record.title).toBe('Blood Test Results');
  });

  it('persists record to AsyncStorage', async () => {
    await svc.uploadRecord(buildRecordParams({ title: 'ECG Report' }));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@karuna_medical_records',
      expect.stringContaining('ECG Report')
    );
  });

  it('defaults isConfidential to false', async () => {
    const record = await svc.uploadRecord(buildRecordParams({ isConfidential: undefined }));
    expect(record.isConfidential).toBe(false);
  });

  it('defaults tags to empty array when omitted', async () => {
    const record = await svc.uploadRecord(buildRecordParams({ tags: undefined }));
    expect(record.tags).toEqual([]);
  });

  it('throws when consent is not granted', async () => {
    const { consentService } = require('../../src/services/consent');
    (consentService.hasConsent as jest.Mock).mockReturnValueOnce(false);

    await expect(svc.uploadRecord(buildRecordParams())).rejects.toThrow(
      'Consent not granted for storing medical documents'
    );
  });

  it('logs a vault audit entry after uploading', async () => {
    const { auditLogService } = require('../../src/services/auditLog');
    await svc.uploadRecord(buildRecordParams());

    expect(auditLogService.logVaultAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'created', entityType: 'medical_record' })
    );
  });
});

// ─── getRecords / getRecordById ───────────────────────────────────────────────

describe('MedicalRecordsService – getRecords', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.uploadRecord(buildRecordParams({ type: 'lab_report', tags: ['blood'] }));
    await svc.uploadRecord(buildRecordParams({ type: 'imaging', title: 'MRI Spine', tags: ['spine'] }));
    await svc.uploadRecord(
      buildRecordParams({
        type: 'prescription',
        title: 'Metformin Rx',
        isConfidential: true,
        tags: ['diabetes'],
      })
    );
  });

  it('returns all records when no filter applied', () => {
    expect(svc.getRecords()).toHaveLength(3);
  });

  it('filters by type', () => {
    const filtered = svc.getRecords({ type: 'imaging' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('MRI Spine');
  });

  it('filters by tag', () => {
    const filtered = svc.getRecords({ tags: ['blood'] });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe('lab_report');
  });

  it('filters confidential-only records', () => {
    const filtered = svc.getRecords({ confidentialOnly: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('Metformin Rx');
  });

  it('respects the limit option', () => {
    expect(svc.getRecords({ limit: 1 })).toHaveLength(1);
  });

  it('getRecordById returns the correct record', () => {
    const all = svc.getRecords();
    const target = all[1];
    const found = svc.getRecordById(target.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(target.id);
  });

  it('getRecordById returns null for unknown id', () => {
    expect(svc.getRecordById('nonexistent_id')).toBeNull();
  });
});

// ─── updateRecord ─────────────────────────────────────────────────────────────

describe('MedicalRecordsService – updateRecord', () => {
  let recordId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const rec = await svc.uploadRecord(buildRecordParams());
    recordId = rec.id;
  });

  it('updates the title and bumps updatedAt', async () => {
    const before = svc.getRecordById(recordId)!.updatedAt;
    await new Promise((r) => setTimeout(r, 5));

    const updated = await svc.updateRecord(recordId, { title: 'Updated Blood Test' });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Updated Blood Test');
    expect(updated!.updatedAt).not.toBe(before);
  });

  it('persists the update to AsyncStorage', async () => {
    jest.clearAllMocks();
    await svc.updateRecord(recordId, { description: 'Updated description' });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@karuna_medical_records',
      expect.stringContaining('Updated description')
    );
  });

  it('returns null when the record does not exist', async () => {
    expect(await svc.updateRecord('bad_id', { title: 'Ghost' })).toBeNull();
  });

  it('storeSummary sets the AI-generated summary field', async () => {
    const updated = await svc.storeSummary(recordId, 'Hemoglobin normal; glucose elevated');
    expect(updated!.summary).toBe('Hemoglobin normal; glucose elevated');
  });
});

// ─── deleteRecord ─────────────────────────────────────────────────────────────

describe('MedicalRecordsService – deleteRecord', () => {
  let recordId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const rec = await svc.uploadRecord(buildRecordParams());
    recordId = rec.id;
  });

  it('removes the record and returns true', async () => {
    expect(await svc.deleteRecord(recordId)).toBe(true);
    expect(svc.getRecords()).toHaveLength(0);
  });

  it('returns false for an unknown id', async () => {
    expect(await svc.deleteRecord('ghost_id')).toBe(false);
  });

  it('logs a vault audit entry after deletion', async () => {
    const { auditLogService } = require('../../src/services/auditLog');
    await svc.deleteRecord(recordId);

    expect(auditLogService.logVaultAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'deleted', entityType: 'medical_record' })
    );
  });
});

// ─── searchRecords ────────────────────────────────────────────────────────────

describe('MedicalRecordsService – searchRecords', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.uploadRecord(buildRecordParams({ title: 'Kidney Function Panel', provider: 'Dr. Iyer' }));
    await svc.uploadRecord(buildRecordParams({ title: 'Chest X-Ray', description: 'Normal findings', provider: 'Dr. Mehta' }));
    await svc.uploadRecord(buildRecordParams({ title: 'Diabetes Checkup', tags: ['diabetes', 'glucose'] }));
  });

  it('finds records by title substring', () => {
    const results = svc.searchRecords('kidney');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Kidney Function Panel');
  });

  it('finds records by provider name', () => {
    const results = svc.searchRecords('mehta');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Chest X-Ray');
  });

  it('finds records by description', () => {
    expect(svc.searchRecords('normal findings')).toHaveLength(1);
  });

  it('finds records by tag', () => {
    const results = svc.searchRecords('glucose');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Diabetes Checkup');
  });

  it('returns empty array when nothing matches', () => {
    expect(svc.searchRecords('zzznotfound')).toHaveLength(0);
  });

  it('search is case-insensitive', () => {
    expect(svc.searchRecords('CHEST')).toHaveLength(1);
  });
});

// ─── getRecordsByDateRange ────────────────────────────────────────────────────

describe('MedicalRecordsService – getRecordsByDateRange', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.uploadRecord(buildRecordParams({ date: '2026-01-15' }));
    await svc.uploadRecord(buildRecordParams({ date: '2026-03-01' }));
    await svc.uploadRecord(buildRecordParams({ date: '2026-05-10' }));
  });

  it('returns records within the inclusive date range', () => {
    expect(svc.getRecordsByDateRange('2026-01-01', '2026-03-31')).toHaveLength(2);
  });

  it('excludes records outside the range', () => {
    const results = svc.getRecordsByDateRange('2026-04-01', '2026-12-31');
    expect(results).toHaveLength(1);
    expect(results[0].date).toBe('2026-05-10');
  });

  it('returns empty array when nothing falls in range', () => {
    expect(svc.getRecordsByDateRange('2025-01-01', '2025-12-31')).toHaveLength(0);
  });
});

// ─── tag management ───────────────────────────────────────────────────────────

describe('MedicalRecordsService – tags', () => {
  let recordId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const rec = await svc.uploadRecord(buildRecordParams({ tags: ['initial'] }));
    recordId = rec.id;
  });

  it('addTags merges new tags without duplicates', async () => {
    const updated = await svc.addTags(recordId, ['cardiac', 'initial', 'annual']);
    expect(updated!.tags.sort()).toEqual(['annual', 'cardiac', 'initial']);
  });

  it('removeTags removes specified tags', async () => {
    await svc.addTags(recordId, ['remove-me', 'keep-me']);
    const updated = await svc.removeTags(recordId, ['remove-me']);
    expect(updated!.tags).not.toContain('remove-me');
    expect(updated!.tags).toContain('keep-me');
  });

  it('getAllTags returns sorted unique tags across all records', async () => {
    await svc.uploadRecord(buildRecordParams({ tags: ['zebra', 'alpha'] }));
    const tags = svc.getAllTags();
    expect(tags).toContain('initial');
    expect(tags).toContain('zebra');
    expect(tags).toContain('alpha');
    expect(tags).toEqual([...tags].sort());
  });
});

// ─── storage usage & export ───────────────────────────────────────────────────

describe('MedicalRecordsService – storage usage & export', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.uploadRecord(buildRecordParams({ type: 'lab_report', documentSize: 100000 }));
    await svc.uploadRecord(buildRecordParams({ type: 'imaging', title: 'MRI', documentSize: 500000 }));
  });

  it('getStorageUsage reports correct total record count', async () => {
    const usage = await svc.getStorageUsage();
    expect(usage.totalRecords).toBe(2);
  });

  it('getStorageUsage sums file sizes', async () => {
    const usage = await svc.getStorageUsage();
    expect(usage.totalSize).toBe(600000);
  });

  it('exportRecords returns a copy; mutation does not affect internal state', () => {
    const exported = svc.exportRecords();
    expect(exported).toHaveLength(2);
    exported.splice(0);
    expect(svc.getRecords()).toHaveLength(2);
  });
});

// ─── clearAllRecords ──────────────────────────────────────────────────────────

describe('MedicalRecordsService – clearAllRecords', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.uploadRecord(buildRecordParams());
    await svc.uploadRecord(buildRecordParams({ title: 'Another Record' }));
  });

  it('removes all records', async () => {
    await svc.clearAllRecords();
    expect(svc.getRecords()).toHaveLength(0);
  });

  it('persists empty state to AsyncStorage', async () => {
    jest.clearAllMocks();
    await svc.clearAllRecords();

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@karuna_medical_records', '[]');
  });
});

// ─── getRecordsSummary ────────────────────────────────────────────────────────

describe('MedicalRecordsService – getRecordsSummary', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns no-records message when list is empty', () => {
    expect(svc.getRecordsSummary()).toContain('No medical records stored');
  });

  it('includes record count per type in the summary', async () => {
    await svc.uploadRecord(buildRecordParams({ type: 'lab_report' }));
    await svc.uploadRecord(buildRecordParams({ type: 'lab_report', title: 'Second Lab' }));

    const summary = svc.getRecordsSummary();
    expect(summary).toContain('Lab Report');
    expect(summary).toContain('2');
  });
});

// ─── pickDocument ─────────────────────────────────────────────────────────────

describe('MedicalRecordsService – pickDocument', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns document info when user selects a file', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///tmp/report.pdf', name: 'report.pdf', size: 12345, mimeType: 'application/pdf' },
      ],
    });

    const result = await svc.pickDocument();

    expect(result).not.toBeNull();
    expect(result!.uri).toBe('file:///tmp/report.pdf');
    expect(result!.name).toBe('report.pdf');
    expect(result!.size).toBe(12345);
    expect(result!.mimeType).toBe('application/pdf');
  });

  it('returns null when user cancels the picker', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: [],
    });

    const result = await svc.pickDocument();
    expect(result).toBeNull();
  });

  it('returns null when assets array is empty', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [],
    });

    const result = await svc.pickDocument();
    expect(result).toBeNull();
  });

  it('defaults size to 0 when asset.size is missing', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/x.pdf', name: 'x.pdf', size: undefined, mimeType: 'application/pdf' }],
    });

    const result = await svc.pickDocument();
    expect(result!.size).toBe(0);
  });

  it('defaults mimeType to application/octet-stream when missing', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///tmp/x.dat', name: 'x.dat', size: 100, mimeType: undefined }],
    });

    const result = await svc.pickDocument();
    expect(result!.mimeType).toBe('application/octet-stream');
  });

  it('returns null when DocumentPicker throws', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockRejectedValueOnce(new Error('picker error'));

    const result = await svc.pickDocument();
    expect(result).toBeNull();
  });
});

// ─── getRecords – category filter ────────────────────────────────────────────

describe('MedicalRecordsService – getRecords category filter', () => {
  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    await svc.uploadRecord(buildRecordParams({ category: 'radiology' }));
    await svc.uploadRecord(buildRecordParams({ title: 'CBC Panel', category: 'diagnostics' }));
  });

  it('filters records by category', () => {
    const results = svc.getRecords({ category: 'radiology' });
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('radiology');
  });

  it('returns all records when category does not match', () => {
    const results = svc.getRecords({ category: 'cardiology' });
    expect(results).toHaveLength(0);
  });
});

// ─── getRecordFileContent ─────────────────────────────────────────────────────

describe('MedicalRecordsService – getRecordFileContent', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('returns null when record does not exist', async () => {
    const result = await svc.getRecordFileContent('nonexistent_id');
    expect(result).toBeNull();
  });

  it('returns null when record exists but has no fileUri', async () => {
    // Inject a record without a fileUri directly
    const record = {
      id: 'rec_nofile',
      title: 'No File Record',
      type: 'lab_report' as const,
      category: 'diagnostics',
      date: '2026-01-01',
      tags: [],
      isConfidential: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (svc as any).records = [record];

    const result = await svc.getRecordFileContent('rec_nofile');
    expect(result).toBeNull();
  });

  it('throws when consent is denied for AI access', async () => {
    // Inject a record with a fileUri
    const record = {
      id: 'rec_withfile',
      title: 'X-Ray',
      type: 'imaging' as const,
      category: 'radiology',
      date: '2026-01-01',
      fileUri: 'file:///data/medical_records/rec_withfile.pdf',
      mimeType: 'application/pdf',
      tags: [],
      isConfidential: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (svc as any).records = [record];

    const { consentService } = require('../../src/services/consent');
    (consentService.hasConsent as jest.Mock).mockReturnValueOnce(false);

    await expect(svc.getRecordFileContent('rec_withfile')).rejects.toThrow(
      'Consent not granted for AI access to medical documents'
    );
  });

  it('returns null on web platform even with consent and fileUri', async () => {
    // In the jsdom/web environment Platform.OS === 'web', so the function returns null after consent check
    const record = {
      id: 'rec_web',
      title: 'Web Record',
      type: 'lab_report' as const,
      category: 'diagnostics',
      date: '2026-01-01',
      fileUri: 'file:///data/medical_records/rec_web.pdf',
      mimeType: 'application/pdf',
      tags: [],
      isConfidential: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (svc as any).records = [record];

    // Consent is granted (default mock returns true)
    const result = await svc.getRecordFileContent('rec_web');
    // On web Platform.OS === 'web', returns null
    expect(result).toBeNull();
  });
});

// ─── initialize – native platform (dir creation) ──────────────────────────────

describe('MedicalRecordsService – initialize on native platform', () => {
  let originalPlatform: string;

  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    // Save original Platform.OS value and override to simulate native
    const Platform = require('react-native').Platform;
    originalPlatform = Platform.OS;
    Platform.OS = 'ios';
  });

  afterEach(() => {
    // Restore Platform.OS
    const Platform = require('react-native').Platform;
    Platform.OS = originalPlatform;
  });

  it('calls getInfoAsync and skips makeDirectory when dir exists', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true });

    await svc.initialize();

    expect(FileSystem.getInfoAsync).toHaveBeenCalled();
    expect(FileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
  });

  it('calls makeDirectoryAsync when directory does not exist', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false });

    await svc.initialize();

    // DOCUMENTS_DIR is computed at module-load time when Platform.OS was 'web' → '',
    // but makeDirectoryAsync is still called with whatever value was captured.
    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
      expect.any(String),
      { intermediates: true }
    );
  });
});

// ─── uploadRecord – native platform file copy ─────────────────────────────────

describe('MedicalRecordsService – uploadRecord on native platform', () => {
  let originalPlatform: string;

  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
    const Platform = require('react-native').Platform;
    originalPlatform = Platform.OS;
    Platform.OS = 'ios';
  });

  afterEach(() => {
    const Platform = require('react-native').Platform;
    Platform.OS = originalPlatform;
  });

  it('copies document to app storage when documentUri is provided', async () => {
    (FileSystem.copyAsync as jest.Mock).mockResolvedValueOnce(undefined);

    const record = await svc.uploadRecord(
      buildRecordParams({
        documentUri: 'file:///cache/tmp.pdf',
        documentName: 'report.pdf',
        documentMimeType: 'application/pdf',
      })
    );

    expect(FileSystem.copyAsync).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'file:///cache/tmp.pdf' })
    );
    expect(record.fileUri).toMatch(/\.pdf$/);
    expect(record.thumbnail).toBeUndefined();
  });

  it('sets thumbnail when documentMimeType is image', async () => {
    (FileSystem.copyAsync as jest.Mock).mockResolvedValueOnce(undefined);

    const record = await svc.uploadRecord(
      buildRecordParams({
        documentUri: 'file:///cache/scan.jpg',
        documentName: 'scan.jpg',
        documentMimeType: 'image/jpeg',
      })
    );

    expect(record.thumbnail).toBeDefined();
    expect(record.fileUri).toBe(record.thumbnail);
  });

  it('throws "Failed to save document" when file copy fails', async () => {
    (FileSystem.copyAsync as jest.Mock).mockRejectedValueOnce(new Error('copy error'));

    await expect(
      svc.uploadRecord(
        buildRecordParams({
          documentUri: 'file:///cache/bad.pdf',
          documentName: 'bad.pdf',
          documentMimeType: 'application/pdf',
        })
      )
    ).rejects.toThrow('Failed to save document');
  });
});

// ─── deleteRecord – native platform file deletion ─────────────────────────────

describe('MedicalRecordsService – deleteRecord on native platform', () => {
  let originalPlatform: string;

  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
    const Platform = require('react-native').Platform;
    originalPlatform = Platform.OS;
    Platform.OS = 'ios';
  });

  afterEach(() => {
    const Platform = require('react-native').Platform;
    Platform.OS = originalPlatform;
  });

  it('calls FileSystem.deleteAsync when record has a fileUri', async () => {
    // Inject a record with a fileUri directly
    const record = {
      id: 'rec_native_delete',
      title: 'Native Record',
      type: 'lab_report' as const,
      category: 'diagnostics',
      date: '2026-01-01',
      fileUri: 'file:///data/medical_records/rec_native_delete.pdf',
      tags: [],
      isConfidential: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (svc as any).records = [record];
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValueOnce(undefined);

    const deleted = await svc.deleteRecord('rec_native_delete');

    expect(deleted).toBe(true);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///data/medical_records/rec_native_delete.pdf',
      { idempotent: true }
    );
  });

  it('continues deletion even when FileSystem.deleteAsync throws', async () => {
    const record = {
      id: 'rec_delete_fail',
      title: 'Delete Fail Record',
      type: 'lab_report' as const,
      category: 'diagnostics',
      date: '2026-01-01',
      fileUri: 'file:///data/medical_records/rec_delete_fail.pdf',
      tags: [],
      isConfidential: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    (svc as any).records = [record];
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValueOnce(new Error('delete error'));

    const deleted = await svc.deleteRecord('rec_delete_fail');

    expect(deleted).toBe(true);
    expect(svc.getRecords()).toHaveLength(0);
  });
});

// ─── clearAllRecords – native platform file deletion ─────────────────────────

describe('MedicalRecordsService – clearAllRecords on native platform', () => {
  let originalPlatform: string;

  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
    const Platform = require('react-native').Platform;
    originalPlatform = Platform.OS;
    Platform.OS = 'ios';
  });

  afterEach(() => {
    const Platform = require('react-native').Platform;
    Platform.OS = originalPlatform;
  });

  it('calls deleteAsync for each record that has a fileUri', async () => {
    const records = [
      {
        id: 'rec_clear_1',
        title: 'Record 1',
        type: 'lab_report' as const,
        category: 'diagnostics',
        date: '2026-01-01',
        fileUri: 'file:///data/medical_records/rec_clear_1.pdf',
        tags: [],
        isConfidential: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'rec_clear_2',
        title: 'Record 2',
        type: 'imaging' as const,
        category: 'radiology',
        date: '2026-01-02',
        fileUri: 'file:///data/medical_records/rec_clear_2.jpg',
        tags: [],
        isConfidential: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'rec_clear_3',
        title: 'Record 3 (no file)',
        type: 'prescription' as const,
        category: 'medications',
        date: '2026-01-03',
        tags: [],
        isConfidential: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    (svc as any).records = records;
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

    await svc.clearAllRecords();

    expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///data/medical_records/rec_clear_1.pdf',
      { idempotent: true }
    );
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///data/medical_records/rec_clear_2.jpg',
      { idempotent: true }
    );
    expect(svc.getRecords()).toHaveLength(0);
  });

  it('continues clearing even when one file deleteAsync throws', async () => {
    const records = [
      {
        id: 'rec_err_1',
        title: 'Error Record',
        type: 'lab_report' as const,
        category: 'diagnostics',
        date: '2026-01-01',
        fileUri: 'file:///data/medical_records/rec_err_1.pdf',
        tags: [],
        isConfidential: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    (svc as any).records = records;
    (FileSystem.deleteAsync as jest.Mock).mockRejectedValueOnce(new Error('fs error'));

    await svc.clearAllRecords();

    expect(svc.getRecords()).toHaveLength(0);
  });
});

// ─── saveRecords error path ───────────────────────────────────────────────────

describe('MedicalRecordsService – saveRecords error path', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('swallows AsyncStorage.setItem errors during save', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage full'));

    // uploadRecord calls saveRecords internally; it should not throw from save errors
    await expect(svc.uploadRecord(buildRecordParams())).resolves.toBeDefined();
  });
});

// ─── addTags / removeTags – null guard ───────────────────────────────────────

describe('MedicalRecordsService – addTags / removeTags null guard', () => {
  beforeEach(() => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;
  });

  it('addTags returns null for unknown id', async () => {
    const result = await svc.addTags('ghost_id', ['tag1']);
    expect(result).toBeNull();
  });

  it('removeTags returns null for unknown id', async () => {
    const result = await svc.removeTags('ghost_id', ['tag1']);
    expect(result).toBeNull();
  });
});

// ─── storeSummary with extractedData ─────────────────────────────────────────

describe('MedicalRecordsService – storeSummary with extractedData', () => {
  let recordId: string;

  beforeEach(async () => {
    clearStore();
    resetService();
    jest.clearAllMocks();
    (svc as any).isInitialized = true;

    const rec = await svc.uploadRecord(buildRecordParams());
    recordId = rec.id;
  });

  it('stores extractedData alongside summary', async () => {
    const extractedData = { cholesterol: 185, glucose: 102 };
    const updated = await svc.storeSummary(recordId, 'All values within range', extractedData);

    expect(updated!.summary).toBe('All values within range');
    expect(updated!.extractedData).toEqual(extractedData);
  });
});
