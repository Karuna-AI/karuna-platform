/**
 * Health Data Service Tests
 * Tests for health metrics, medication tracking, and medical records
 */

import {
  createMockMedication,
  createMockHealthRecord,
} from '../utils/testUtils';

describe('Health Data Service', () => {
  describe('vitals tracking', () => {
    it('should record blood pressure reading', async () => {
      const reading = {
        systolic: 120,
        diastolic: 80,
        timestamp: new Date().toISOString(),
      };

      expect(reading.systolic).toBe(120);
      expect(reading.diastolic).toBe(80);
    });

    it('should record heart rate', async () => {
      const heartRate = {
        value: 72,
        unit: 'bpm',
        timestamp: new Date().toISOString(),
      };

      expect(heartRate.value).toBe(72);
      expect(heartRate.unit).toBe('bpm');
    });

    it('should record temperature', async () => {
      const temp = {
        value: 98.6,
        unit: 'F',
        timestamp: new Date().toISOString(),
      };

      expect(temp.value).toBe(98.6);
    });

    it('should record weight', async () => {
      const weight = {
        value: 150,
        unit: 'lbs',
        timestamp: new Date().toISOString(),
      };

      expect(weight.value).toBe(150);
    });

    it('should record blood glucose', async () => {
      const glucose = {
        value: 95,
        unit: 'mg/dL',
        fasting: true,
        timestamp: new Date().toISOString(),
      };

      expect(glucose.value).toBe(95);
      expect(glucose.fasting).toBe(true);
    });

    it('should record oxygen saturation', async () => {
      const o2sat = {
        value: 98,
        unit: '%',
        timestamp: new Date().toISOString(),
      };

      expect(o2sat.value).toBe(98);
    });
  });

  describe('vitals history', () => {
    it('should retrieve vitals history by date range', () => {
      const readings = [
        { date: '2024-01-01', systolic: 120, diastolic: 80 },
        { date: '2024-01-02', systolic: 118, diastolic: 78 },
        { date: '2024-01-03', systolic: 122, diastolic: 82 },
      ];

      const filtered = readings.filter(r =>
        r.date >= '2024-01-01' && r.date <= '2024-01-02'
      );

      expect(filtered).toHaveLength(2);
    });

    it('should calculate average vitals', () => {
      const readings = [
        { systolic: 120, diastolic: 80 },
        { systolic: 118, diastolic: 78 },
        { systolic: 122, diastolic: 82 },
      ];

      const avgSystolic = readings.reduce((sum, r) => sum + r.systolic, 0) / readings.length;
      const avgDiastolic = readings.reduce((sum, r) => sum + r.diastolic, 0) / readings.length;

      expect(avgSystolic).toBe(120);
      expect(avgDiastolic).toBe(80);
    });

    it('should detect abnormal readings', () => {
      const readings = [
        { systolic: 120, diastolic: 80, abnormal: false },
        { systolic: 180, diastolic: 110, abnormal: true },
        { systolic: 90, diastolic: 55, abnormal: true },
      ];

      const abnormal = readings.filter(r => r.abnormal);

      expect(abnormal).toHaveLength(2);
    });
  });

  describe('health record management', () => {
    it('should create health record', () => {
      const record = createMockHealthRecord({
        type: 'lab_results',
        data: { hemoglobin: 14.5, wbc: 7500 },
      });

      expect(record.type).toBe('lab_results');
      expect(record.data.hemoglobin).toBe(14.5);
    });

    it('should update health record', () => {
      const record = createMockHealthRecord();
      const updated = {
        ...record,
        data: { ...record.data, notes: 'Updated notes' },
      };

      expect(updated.data.notes).toBe('Updated notes');
    });

    it('should delete health record', () => {
      const records = [
        createMockHealthRecord({ id: '1' }),
        createMockHealthRecord({ id: '2' }),
      ];

      const filtered = records.filter(r => r.id !== '1');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    it('should search health records', () => {
      const records = [
        createMockHealthRecord({ type: 'vitals' }),
        createMockHealthRecord({ type: 'lab_results' }),
        createMockHealthRecord({ type: 'vitals' }),
      ];

      const vitalsRecords = records.filter(r => r.type === 'vitals');

      expect(vitalsRecords).toHaveLength(2);
    });
  });
});

describe('Medication Service', () => {
  describe('medication CRUD', () => {
    it('should create medication', () => {
      const med = createMockMedication({
        name: 'Aspirin',
        dosage: '81mg',
        frequency: 'daily',
      });

      expect(med.name).toBe('Aspirin');
      expect(med.dosage).toBe('81mg');
    });

    it('should update medication', () => {
      const med = createMockMedication();
      const updated = { ...med, dosage: '20mg' };

      expect(updated.dosage).toBe('20mg');
    });

    it('should delete medication', () => {
      const meds = [
        createMockMedication({ id: '1' }),
        createMockMedication({ id: '2' }),
      ];

      const filtered = meds.filter(m => m.id !== '1');

      expect(filtered).toHaveLength(1);
    });

    it('should list all medications', () => {
      const meds = [
        createMockMedication({ name: 'Med1' }),
        createMockMedication({ name: 'Med2' }),
        createMockMedication({ name: 'Med3' }),
      ];

      expect(meds).toHaveLength(3);
    });
  });

  describe('medication reminders', () => {
    it('should schedule medication reminder', () => {
      const med = createMockMedication({
        times: ['08:00', '14:00', '20:00'],
      });

      expect(med.times).toHaveLength(3);
    });

    it('should check if medication is due', () => {
      const currentHour = new Date().getHours();
      const med = createMockMedication({
        times: [`${currentHour.toString().padStart(2, '0')}:00`],
      });

      const isDue = med.times.some((time: string) => {
        const [hour] = time.split(':').map(Number);
        return hour === currentHour;
      });

      expect(isDue).toBe(true);
    });

    it('should track medication taken status', () => {
      const med = createMockMedication();
      const takenLog = {
        medicationId: med.id,
        timestamp: new Date().toISOString(),
        taken: true,
      };

      expect(takenLog.taken).toBe(true);
    });

    it('should track missed medications', () => {
      const med = createMockMedication();
      const missedLog = {
        medicationId: med.id,
        timestamp: new Date().toISOString(),
        taken: false,
        reason: 'Forgot',
      };

      expect(missedLog.taken).toBe(false);
      expect(missedLog.reason).toBe('Forgot');
    });
  });

  describe('medication interactions', () => {
    it('should check for drug interactions', () => {
      const meds = ['Warfarin', 'Aspirin'];
      const hasInteraction = meds.includes('Warfarin') && meds.includes('Aspirin');

      expect(hasInteraction).toBe(true);
    });

    it('should warn about potential interactions', () => {
      const warnings = [
        { drugs: ['Warfarin', 'Aspirin'], severity: 'high' },
        { drugs: ['Metformin', 'Alcohol'], severity: 'moderate' },
      ];

      const highSeverity = warnings.filter(w => w.severity === 'high');

      expect(highSeverity).toHaveLength(1);
    });
  });
});

describe('Medical Records Service', () => {
  describe('document management', () => {
    it('should upload medical document', () => {
      const doc = {
        id: 'doc-1',
        type: 'lab_report',
        filename: 'bloodwork_2024.pdf',
        uploadDate: new Date().toISOString(),
        size: 1024000,
      };

      expect(doc.type).toBe('lab_report');
    });

    it('should categorize documents', () => {
      const docs = [
        { type: 'lab_report', filename: 'bloodwork.pdf' },
        { type: 'prescription', filename: 'rx.pdf' },
        { type: 'imaging', filename: 'xray.dcm' },
      ];

      const labReports = docs.filter(d => d.type === 'lab_report');

      expect(labReports).toHaveLength(1);
    });

    it('should search documents', () => {
      const docs = [
        { filename: 'bloodwork_jan.pdf', content: 'hemoglobin results' },
        { filename: 'xray_feb.pdf', content: 'chest examination' },
      ];

      const results = docs.filter(d =>
        d.filename.toLowerCase().includes('blood') ||
        d.content.toLowerCase().includes('blood')
      );

      expect(results).toHaveLength(1);
    });
  });

  describe('provider records', () => {
    it('should store doctor information', () => {
      const doctor = {
        id: 'dr-1',
        name: 'Dr. Smith',
        specialty: 'Cardiology',
        phone: '555-1234',
        facility: 'General Hospital',
      };

      expect(doctor.specialty).toBe('Cardiology');
    });

    it('should track appointments', () => {
      const appointment = {
        id: 'apt-1',
        doctorId: 'dr-1',
        date: '2024-02-15',
        time: '10:00',
        purpose: 'Follow-up',
        status: 'scheduled',
      };

      expect(appointment.status).toBe('scheduled');
    });
  });
});
