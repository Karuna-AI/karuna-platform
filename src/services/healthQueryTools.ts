/**
 * Health Query Tools
 * AI-accessible tools for querying health data with consent enforcement
 * These tools enable grounded responses from real health data
 */

import { consentService } from './consent';
import { auditLogService } from './auditLog';
import { healthDataService } from './healthData';
import { medicationService } from './medication';
import { medicalRecordsService } from './medicalRecords';
import { VitalType, VITAL_TYPE_INFO } from '../types/health';

export interface HealthQueryResult {
  success: boolean;
  data?: unknown;
  summary?: string;
  error?: string;
  requiresConsent?: boolean;
}

export interface HealthToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
  }>;
  execute: (params: Record<string, unknown>) => Promise<HealthQueryResult>;
}

/**
 * Health Query Tools Service
 * Provides AI-accessible tools for health data queries
 */
class HealthQueryToolsService {
  private tools: Map<string, HealthToolDefinition> = new Map();

  constructor() {
    this.registerTools();
  }

  /**
   * Register all health query tools
   */
  private registerTools(): void {
    // Tool: Get current medications
    this.tools.set('get_medications', {
      name: 'get_medications',
      description: 'Get the user\'s current medication list with dosages and schedules',
      parameters: {
        activeOnly: {
          type: 'boolean',
          description: 'Whether to return only active medications',
          required: false,
        },
      },
      execute: this.getMedications.bind(this),
    });

    // Tool: Get today's medication schedule
    this.tools.set('get_medication_schedule', {
      name: 'get_medication_schedule',
      description: 'Get today\'s medication schedule with doses taken/pending',
      parameters: {},
      execute: this.getMedicationSchedule.bind(this),
    });

    // Tool: Get medication adherence
    this.tools.set('get_medication_adherence', {
      name: 'get_medication_adherence',
      description: 'Get medication adherence statistics for a period',
      parameters: {
        period: {
          type: 'string',
          description: 'Time period for adherence calculation',
          enum: ['day', 'week', 'month'],
          required: false,
        },
      },
      execute: this.getMedicationAdherence.bind(this),
    });

    // Tool: Get vital signs
    this.tools.set('get_vitals', {
      name: 'get_vitals',
      description: 'Get vital sign readings (steps, heart rate, blood pressure, etc.)',
      parameters: {
        type: {
          type: 'string',
          description: 'Type of vital to retrieve',
          enum: ['steps', 'heart_rate', 'blood_pressure', 'blood_glucose', 'weight', 'temperature', 'oxygen_saturation', 'sleep'],
          required: true,
        },
        period: {
          type: 'string',
          description: 'Time period for readings',
          enum: ['day', 'week', 'month'],
          required: false,
        },
      },
      execute: this.getVitals.bind(this),
    });

    // Tool: Get step count comparison
    this.tools.set('get_steps_status', {
      name: 'get_steps_status',
      description: 'Get today\'s step count with goal comparison and status message',
      parameters: {},
      execute: this.getStepsStatus.bind(this),
    });

    // Tool: Get next medication dose
    this.tools.set('get_next_dose', {
      name: 'get_next_dose',
      description: 'Get information about the next scheduled medication dose',
      parameters: {},
      execute: this.getNextDose.bind(this),
    });

    // Tool: Search medical records
    this.tools.set('search_records', {
      name: 'search_records',
      description: 'Search medical records by query string',
      parameters: {
        query: {
          type: 'string',
          description: 'Search query for medical records',
          required: true,
        },
      },
      execute: this.searchRecords.bind(this),
    });

    // Tool: Get health summary
    this.tools.set('get_health_summary', {
      name: 'get_health_summary',
      description: 'Get a comprehensive health summary including vitals, medications, and records',
      parameters: {},
      execute: this.getHealthSummary.bind(this),
    });

    // Tool: Check health data consent
    this.tools.set('check_health_consent', {
      name: 'check_health_consent',
      description: 'Check if consent is granted for health data access',
      parameters: {
        category: {
          type: 'string',
          description: 'Consent category to check',
          enum: ['health_data', 'personal_documents'],
          required: true,
        },
      },
      execute: this.checkHealthConsent.bind(this),
    });
  }

  /**
   * Get all available tools for AI registration
   */
  getToolDefinitions(): HealthToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a health query tool
   */
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<HealthQueryResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        success: false,
        error: `Unknown health tool: ${toolName}`,
      };
    }

    try {
      const result = await tool.execute(params);

      // Log the query
      await auditLogService.log({
        action: 'ai_query_executed',
        category: 'ai',
        description: `Health query: ${toolName}`,
        metadata: { params, success: result.success },
      });

      return result;
    } catch (error) {
      console.error(`[HealthQueryTools] Error executing ${toolName}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Query failed',
      };
    }
  }

  /**
   * Tool: Get medications
   */
  private async getMedications(params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');
    if (!hasConsent) {
      return {
        success: false,
        requiresConsent: true,
        error: 'Health data access requires consent',
      };
    }

    await medicationService.initialize();
    const activeOnly = params.activeOnly as boolean ?? true;
    const medications = medicationService.getMedications(activeOnly);

    const summary = medicationService.getMedicationSummary();

    return {
      success: true,
      data: medications,
      summary,
    };
  }

  /**
   * Tool: Get medication schedule
   */
  private async getMedicationSchedule(_params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');
    if (!hasConsent) {
      return {
        success: false,
        requiresConsent: true,
        error: 'Health data access requires consent',
      };
    }

    await medicationService.initialize();
    const schedule = medicationService.getTodaySchedule();

    if (schedule.length === 0) {
      return {
        success: true,
        data: [],
        summary: 'No medications scheduled for today.',
      };
    }

    const lines = schedule.map((item) => {
      const status = item.dose?.status || 'pending';
      const statusEmoji = status === 'taken' ? '✓' : status === 'skipped' ? '⏭' : '○';
      return `${statusEmoji} ${item.schedule.time} - ${item.medication.name} (${item.medication.dosage} ${item.medication.unit})`;
    });

    const taken = schedule.filter((s) => s.dose?.status === 'taken').length;
    const total = schedule.length;

    return {
      success: true,
      data: schedule,
      summary: `Today's medication schedule (${taken}/${total} taken):\n${lines.join('\n')}`,
    };
  }

  /**
   * Tool: Get medication adherence
   */
  private async getMedicationAdherence(params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');
    if (!hasConsent) {
      return {
        success: false,
        requiresConsent: true,
        error: 'Health data access requires consent',
      };
    }

    await medicationService.initialize();
    const period = (params.period as 'day' | 'week' | 'month') || 'week';
    const adherence = medicationService.getAdherence(undefined, period);

    if (adherence.length === 0) {
      return {
        success: true,
        data: [],
        summary: 'No medication adherence data available.',
      };
    }

    const lines = adherence.map((a) => {
      const rate = a.adherenceRate;
      const emoji = rate >= 90 ? '🌟' : rate >= 70 ? '👍' : rate >= 50 ? '⚠️' : '❌';
      return `${emoji} ${a.medicationName}: ${rate}% adherence (${a.takenDoses}/${a.totalDoses} doses)`;
    });

    const overallRate = Math.round(
      adherence.reduce((sum, a) => sum + a.adherenceRate, 0) / adherence.length
    );

    return {
      success: true,
      data: adherence,
      summary: `Medication adherence for the past ${period} (${overallRate}% overall):\n${lines.join('\n')}`,
    };
  }

  /**
   * Tool: Get vitals
   */
  private async getVitals(params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');
    if (!hasConsent) {
      return {
        success: false,
        requiresConsent: true,
        error: 'Health data access requires consent',
      };
    }

    await healthDataService.initialize();
    const type = params.type as VitalType;
    const period = (params.period as 'day' | 'week' | 'month') || 'day';

    const vitalInfo = VITAL_TYPE_INFO[type];
    if (!vitalInfo) {
      return {
        success: false,
        error: `Unknown vital type: ${type}`,
      };
    }

    const summary = healthDataService.getVitalSummary(type, period);

    let summaryText = `${vitalInfo.displayName} summary for the past ${period}:\n`;

    if (summary.latestReading) {
      summaryText += `Latest: ${summary.latestReading.value} ${summary.unit}\n`;
    }

    if (summary.average !== undefined) {
      summaryText += `Average: ${summary.average} ${summary.unit}\n`;
      summaryText += `Range: ${summary.min} - ${summary.max} ${summary.unit}\n`;
    }

    if (summary.trend !== 'unknown') {
      const trendEmoji = summary.trend === 'up' ? '📈' : summary.trend === 'down' ? '📉' : '➡️';
      summaryText += `Trend: ${trendEmoji} ${summary.trend}\n`;
    }

    if (summary.normalRange) {
      const latest = summary.latestReading?.value;
      if (latest !== undefined) {
        if (latest < summary.normalRange.min) {
          summaryText += `Status: Below normal range (${summary.normalRange.min}-${summary.normalRange.max})`;
        } else if (latest > summary.normalRange.max) {
          summaryText += `Status: Above normal range (${summary.normalRange.min}-${summary.normalRange.max})`;
        } else {
          summaryText += `Status: Within normal range`;
        }
      }
    }

    return {
      success: true,
      data: summary,
      summary: summaryText,
    };
  }

  /**
   * Tool: Get steps status
   */
  private async getStepsStatus(_params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');
    if (!hasConsent) {
      return {
        success: false,
        requiresConsent: true,
        error: 'Health data access requires consent',
      };
    }

    await healthDataService.initialize();
    const comparison = healthDataService.getStepsComparison();

    return {
      success: true,
      data: comparison,
      summary: comparison.message,
    };
  }

  /**
   * Tool: Get next dose
   */
  private async getNextDose(_params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');
    if (!hasConsent) {
      return {
        success: false,
        requiresConsent: true,
        error: 'Health data access requires consent',
      };
    }

    await medicationService.initialize();
    const nextDose = medicationService.getNextDose();

    if (!nextDose) {
      return {
        success: true,
        data: null,
        summary: 'No more medications scheduled for today.',
      };
    }

    const timeStr = nextDose.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      success: true,
      data: nextDose,
      summary: `Next medication: ${nextDose.medication.name} (${nextDose.medication.dosage} ${nextDose.medication.unit}) at ${timeStr}`,
    };
  }

  /**
   * Tool: Search records
   */
  private async searchRecords(params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasConsent = consentService.hasConsent('personal_documents', 'ai_assistant', 'read');
    if (!hasConsent) {
      return {
        success: false,
        requiresConsent: true,
        error: 'Medical records access requires consent',
      };
    }

    await medicalRecordsService.initialize();
    const query = params.query as string;
    const records = medicalRecordsService.searchRecords(query);

    if (records.length === 0) {
      return {
        success: true,
        data: [],
        summary: `No medical records found matching "${query}".`,
      };
    }

    const lines = records.slice(0, 5).map((r) => {
      const summary = r.summary ? `: ${r.summary.substring(0, 100)}...` : '';
      return `- ${r.title} (${r.date})${summary}`;
    });

    return {
      success: true,
      data: records,
      summary: `Found ${records.length} medical record(s) matching "${query}":\n${lines.join('\n')}`,
    };
  }

  /**
   * Tool: Get health summary
   */
  private async getHealthSummary(_params: Record<string, unknown>): Promise<HealthQueryResult> {
    const hasHealthConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');
    const hasDocConsent = consentService.hasConsent('personal_documents', 'ai_assistant', 'read');

    const summaryParts: string[] = [];

    if (hasHealthConsent) {
      await medicationService.initialize();
      await healthDataService.initialize();

      // Medications
      const medSummary = medicationService.getMedicationSummary();
      summaryParts.push(medSummary);

      // Steps
      const steps = healthDataService.getStepsComparison();
      summaryParts.push(`\nToday's activity: ${steps.message}`);

      // Medication adherence
      const adherence = medicationService.getAdherence(undefined, 'week');
      if (adherence.length > 0) {
        const overallRate = Math.round(
          adherence.reduce((sum, a) => sum + a.adherenceRate, 0) / adherence.length
        );
        summaryParts.push(`\nMedication adherence (past week): ${overallRate}%`);
      }
    } else {
      summaryParts.push('Health data access requires consent.');
    }

    if (hasDocConsent) {
      await medicalRecordsService.initialize();
      const recordsSummary = medicalRecordsService.getRecordsSummary();
      summaryParts.push(`\n${recordsSummary}`);
    }

    return {
      success: true,
      summary: summaryParts.join('\n'),
    };
  }

  /**
   * Tool: Check health consent
   */
  private async checkHealthConsent(params: Record<string, unknown>): Promise<HealthQueryResult> {
    const category = params.category as 'health_data' | 'personal_documents';
    const hasConsent = consentService.hasConsent(category, 'ai_assistant', 'read');

    return {
      success: true,
      data: { hasConsent, category },
      summary: hasConsent
        ? `Consent granted for ${category} access.`
        : `Consent not granted for ${category}. Please enable in Settings > Security > Consent.`,
    };
  }
}

export const healthQueryToolsService = new HealthQueryToolsService();
export default healthQueryToolsService;
