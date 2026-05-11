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
