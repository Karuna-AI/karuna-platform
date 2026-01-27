/**
 * Health Chat Tools
 * Detects health-related queries and provides grounded health context for AI responses
 */

import { consentService } from './consent';
import { healthQueryToolsService, HealthQueryResult } from './healthQueryTools';
import { healthDataService } from './healthData';
import { medicationService } from './medication';
import { medicalRecordsService } from './medicalRecords';

export interface HealthQuery {
  type: 'medication' | 'vitals' | 'steps' | 'adherence' | 'records' | 'health_summary';
  parameters: Record<string, unknown>;
  confidence: number;
}

/**
 * Health-related query patterns
 */
const HEALTH_PATTERNS: {
  pattern: RegExp;
  type: HealthQuery['type'];
  parameters?: Record<string, unknown>;
}[] = [
  // Medication queries
  {
    pattern: /\b(what|which)\s+(meds?|medications?|pills?|medicine)\s+(do|am)\s+i\s+(take|taking|on)\b/i,
    type: 'medication',
  },
  {
    pattern: /\b(my|current)\s+(meds?|medications?|prescriptions?)\b/i,
    type: 'medication',
  },
  {
    pattern: /\b(list|show|tell|what are)\s+(my\s+)?(meds?|medications?)\b/i,
    type: 'medication',
  },
  {
    pattern: /\bwhen\s+(do|should)\s+i\s+take\s+(my\s+)?(next\s+)?(meds?|medications?|pills?|dose)\b/i,
    type: 'medication',
    parameters: { includeNextDose: true },
  },
  {
    pattern: /\b(did|have)\s+i\s+(take|taken)\s+(my\s+)?(meds?|medications?|pills?)\b/i,
    type: 'medication',
    parameters: { includeSchedule: true },
  },

  // Steps/Activity queries
  {
    pattern: /\b(my|today'?s?)\s+(step|steps|step count|activity)\b/i,
    type: 'steps',
  },
  {
    pattern: /\bhow\s+(many\s+)?steps\s+(have\s+i|did\s+i)\b/i,
    type: 'steps',
  },
  {
    pattern: /\b(step|walking|activity)\s+(goal|progress|count)\b/i,
    type: 'steps',
  },
  {
    pattern: /\b(am\s+i\s+)?(meeting|hitting|reaching)\s+(my\s+)?(step|activity)\s+goal\b/i,
    type: 'steps',
  },
  {
    pattern: /\bstep\s+count\s+(is\s+)?(low|high|good|bad)\b/i,
    type: 'steps',
  },

  // Vitals queries
  {
    pattern: /\b(my|current|latest)\s+(heart\s+rate|pulse|bpm)\b/i,
    type: 'vitals',
    parameters: { vitalType: 'heart_rate' },
  },
  {
    pattern: /\b(my|current|latest)\s+(blood\s+pressure|bp)\b/i,
    type: 'vitals',
    parameters: { vitalType: 'blood_pressure' },
  },
  {
    pattern: /\b(my|current|latest)\s+(blood\s+sugar|glucose|blood\s+glucose)\b/i,
    type: 'vitals',
    parameters: { vitalType: 'blood_glucose' },
  },
  {
    pattern: /\b(my|current|latest)\s+(weight)\b/i,
    type: 'vitals',
    parameters: { vitalType: 'weight' },
  },
  {
    pattern: /\b(my|current|latest)\s+(temperature|temp)\b/i,
    type: 'vitals',
    parameters: { vitalType: 'temperature' },
  },
  {
    pattern: /\b(my|current|latest)\s+(oxygen|spo2|o2\s+sat)\b/i,
    type: 'vitals',
    parameters: { vitalType: 'oxygen_saturation' },
  },
  {
    pattern: /\bhow\s+(did\s+i|much\s+did\s+i)\s+sleep\b/i,
    type: 'vitals',
    parameters: { vitalType: 'sleep' },
  },

  // Adherence queries
  {
    pattern: /\b(medication|med)\s+(adherence|compliance)\b/i,
    type: 'adherence',
  },
  {
    pattern: /\bhow\s+(well|good)\s+(am\s+i|have\s+i\s+been)\s+taking\s+(my\s+)?meds\b/i,
    type: 'adherence',
  },
  {
    pattern: /\b(missed|skipped)\s+(any\s+)?(doses?|meds?|medications?)\b/i,
    type: 'adherence',
  },

  // Medical records queries
  {
    pattern: /\b(my|recent|latest)\s+(lab|test)\s+(results?|reports?)\b/i,
    type: 'records',
    parameters: { recordType: 'lab_report' },
  },
  {
    pattern: /\b(my|recent)\s+(medical\s+)?(records?|documents?)\b/i,
    type: 'records',
  },
  {
    pattern: /\b(x-?ray|mri|ct\s+scan|imaging|ultrasound)\s+(results?|reports?)\b/i,
    type: 'records',
    parameters: { recordType: 'imaging' },
  },

  // General health summary
  {
    pattern: /\b(my\s+)?health\s+(summary|overview|status)\b/i,
    type: 'health_summary',
  },
  {
    pattern: /\bhow\s+(am\s+i|is\s+my\s+health)\s+(doing|today)\b/i,
    type: 'health_summary',
  },
];

/**
 * Detect if a message is a health-related query
 */
export function detectHealthQuery(text: string): HealthQuery | null {
  const lowerText = text.toLowerCase();

  for (const { pattern, type, parameters } of HEALTH_PATTERNS) {
    if (pattern.test(lowerText)) {
      return {
        type,
        parameters: parameters || {},
        confidence: 0.8,
      };
    }
  }

  return null;
}

/**
 * Execute a health query and return the result
 */
export async function executeHealthQuery(query: HealthQuery): Promise<{
  success: boolean;
  message: string;
  data?: unknown;
  requiresConsent?: boolean;
}> {
  try {
    let result: HealthQueryResult;

    switch (query.type) {
      case 'medication': {
        if (query.parameters.includeNextDose) {
          result = await healthQueryToolsService.executeTool('get_next_dose', {});
          if (result.success && !result.data) {
            // Also get full schedule
            const scheduleResult = await healthQueryToolsService.executeTool('get_medication_schedule', {});
            return {
              success: true,
              message: scheduleResult.summary || 'No medication information available.',
              data: scheduleResult.data,
            };
          }
        } else if (query.parameters.includeSchedule) {
          result = await healthQueryToolsService.executeTool('get_medication_schedule', {});
        } else {
          result = await healthQueryToolsService.executeTool('get_medications', { activeOnly: true });
        }
        break;
      }

      case 'steps':
        result = await healthQueryToolsService.executeTool('get_steps_status', {});
        break;

      case 'vitals':
        result = await healthQueryToolsService.executeTool('get_vitals', {
          type: query.parameters.vitalType || 'heart_rate',
          period: 'day',
        });
        break;

      case 'adherence':
        result = await healthQueryToolsService.executeTool('get_medication_adherence', {
          period: 'week',
        });
        break;

      case 'records':
        result = await healthQueryToolsService.executeTool('search_records', {
          query: query.parameters.recordType || '',
        });
        break;

      case 'health_summary':
        result = await healthQueryToolsService.executeTool('get_health_summary', {});
        break;

      default:
        return {
          success: false,
          message: 'Unknown health query type.',
        };
    }

    if (result.requiresConsent) {
      return {
        success: false,
        message: 'I need your permission to access health data. Please enable health data consent in Settings > Security > Consent.',
        requiresConsent: true,
      };
    }

    return {
      success: result.success,
      message: result.summary || 'No data available.',
      data: result.data,
    };
  } catch (error) {
    console.error('[HealthChatTools] Query execution error:', error);
    return {
      success: false,
      message: 'Sorry, I had trouble accessing your health information.',
    };
  }
}

/**
 * Get health context for AI to include in responses
 * This provides summary info without requiring a specific query
 */
export async function getHealthContextForAI(): Promise<string> {
  const hasHealthConsent = consentService.hasConsent('health_data', 'ai_assistant', 'read');

  if (!hasHealthConsent) {
    return '';
  }

  try {
    const contextParts: string[] = [];

    // Initialize services
    await healthDataService.initialize();
    await medicationService.initialize();

    // Add medication context
    const medications = medicationService.getMedications(true);
    if (medications.length > 0) {
      const medNames = medications.map((m) => m.name).join(', ');
      contextParts.push(`[User's active medications: ${medNames}]`);

      // Check for upcoming dose
      const nextDose = medicationService.getNextDose();
      if (nextDose) {
        const timeStr = nextDose.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        contextParts.push(`[Next dose: ${nextDose.medication.name} at ${timeStr}]`);
      }
    }

    // Add steps context
    const steps = healthDataService.getStepsComparison();
    if (steps.current > 0) {
      contextParts.push(`[Today's steps: ${steps.current.toLocaleString()} of ${steps.goal.toLocaleString()} goal (${steps.percentage}%)]`);
    }

    // Add adherence context
    const adherence = medicationService.getAdherence(undefined, 'week');
    if (adherence.length > 0) {
      const overallRate = Math.round(
        adherence.reduce((sum, a) => sum + a.adherenceRate, 0) / adherence.length
      );
      if (overallRate < 80) {
        contextParts.push(`[Medication adherence this week: ${overallRate}% - could be improved]`);
      }
    }

    if (contextParts.length > 0) {
      return '\n\n' + contextParts.join('\n');
    }

    return '';
  } catch (error) {
    console.error('[HealthChatTools] Context generation error:', error);
    return '';
  }
}

/**
 * Format health data for natural conversation
 */
export function formatHealthResponse(data: unknown, type: HealthQuery['type']): string {
  // This could be expanded to format different data types nicely
  // For now, the summary from the tools is usually sufficient
  return '';
}
