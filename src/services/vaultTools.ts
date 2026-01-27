import { vaultService } from './vault';
import { VaultLookupResult } from '../types/vault';

/**
 * Vault Tools for AI Integration
 *
 * These tools allow the AI to retrieve information from the Knowledge Vault
 * to answer questions like "What's my SBI account number?" or "Where are my property documents?"
 *
 * The AI uses these tools rather than hallucinating information.
 */

export interface VaultToolResult {
  success: boolean;
  data?: any;
  message: string;
  shouldSpeak?: boolean; // Whether the response should be spoken aloud
}

/**
 * Parse user queries to determine which vault tool to use
 */
export interface VaultQuery {
  type: 'account' | 'document' | 'medication' | 'doctor' | 'appointment' | 'contact' | 'search';
  keywords: string[];
  originalQuery: string;
}

/**
 * Detect vault-related queries from user input
 */
export function detectVaultQuery(text: string): VaultQuery | null {
  const lower = text.toLowerCase();

  // Account queries
  const accountPatterns = [
    /(?:what(?:'s| is))?\s*my\s+(?:(\w+)\s+)?(?:account|bank|a\/c)\s*(?:number|no\.?)?/i,
    /(?:what(?:'s| is))?\s*(?:the\s+)?(?:(\w+)\s+)?ifsc\s*(?:code)?/i,
    /(?:what(?:'s| is))?\s*my\s+(\w+)\s+(?:insurance|policy)\s*(?:number)?/i,
    /(?:what(?:'s| is))?\s*my\s+(?:aadhaar|aadhar|pan|passport)\s*(?:number)?/i,
    /account\s+(?:number|details?)\s+(?:for|of)\s+(\w+)/i,
  ];

  for (const pattern of accountPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const keywords = match[1] ? [match[1]] : [];
      // Extract institution name from query
      const institutionMatch = lower.match(/(?:sbi|hdfc|icici|axis|kotak|pnb|bob|state bank|punjab national)/i);
      if (institutionMatch) {
        keywords.push(institutionMatch[0]);
      }
      return {
        type: 'account',
        keywords,
        originalQuery: text,
      };
    }
  }

  // Document queries
  const documentPatterns = [
    /where\s+(?:are|is)\s+my\s+(.+?)(?:\s+(?:document|papers?|file|certificate))?(?:\s+(?:kept|stored|located))?/i,
    /(?:find|locate|get)\s+(?:my\s+)?(.+?)\s+(?:document|papers?|certificate)/i,
    /(?:property|land)\s+(?:document|papers?|deed)/i,
    /(?:birth|death|marriage)\s+certificate/i,
    /where\s+(?:did\s+i|have\s+i)\s+(?:keep|put|store)\s+(.+)/i,
  ];

  for (const pattern of documentPatterns) {
    const match = lower.match(pattern);
    if (match) {
      return {
        type: 'document',
        keywords: match[1] ? [match[1].trim()] : [],
        originalQuery: text,
      };
    }
  }

  // Medication queries
  const medicationPatterns = [
    /(?:what|which)\s+(?:are\s+)?my\s+(?:medicines?|medications?|pills?|tablets?)/i,
    /(?:what|when)\s+(?:medicine|medication|pills?)\s+(?:do\s+i|should\s+i)\s+take/i,
    /(?:list|show)\s+(?:my\s+)?(?:medicines?|medications?)/i,
    /(?:medicine|medication)\s+(?:schedule|timings?|routine)/i,
    /what\s+(?:time|when)\s+(?:should\s+i|do\s+i)\s+take\s+(.+)/i,
  ];

  for (const pattern of medicationPatterns) {
    const match = lower.match(pattern);
    if (match) {
      return {
        type: 'medication',
        keywords: match[1] ? [match[1].trim()] : [],
        originalQuery: text,
      };
    }
  }

  // Doctor queries
  const doctorPatterns = [
    /(?:who\s+is|what(?:'s| is))\s+(?:my|the)\s+(.+?)\s*(?:doctor|physician)/i,
    /(?:contact|phone|number)\s+(?:for|of)\s+(?:dr\.?|doctor)\s+(\w+)/i,
    /(?:dr\.?|doctor)\s+(\w+)(?:'s)?\s+(?:contact|phone|clinic|address)/i,
    /(?:when|what\s+time)\s+(?:is|are)\s+(?:dr\.?|doctor)\s+(\w+)\s+(?:available|open)/i,
    /my\s+(\w+)(?:ist)?\s+doctor/i, // e.g., "my cardiologist doctor"
  ];

  for (const pattern of doctorPatterns) {
    const match = lower.match(pattern);
    if (match) {
      return {
        type: 'doctor',
        keywords: match[1] ? [match[1].trim()] : [],
        originalQuery: text,
      };
    }
  }

  // Appointment queries
  const appointmentPatterns = [
    /(?:when\s+is|what(?:'s| is))\s+my\s+(?:next\s+)?(?:appointment|checkup|visit)/i,
    /(?:do\s+i\s+have|any)\s+(?:upcoming\s+)?(?:appointments?|visits?)/i,
    /(?:schedule|appointments?)\s+(?:for\s+)?(?:this|next)\s+(?:week|month)/i,
    /(?:when|what\s+date)\s+(?:is|am\s+i)\s+(?:meeting|seeing)\s+(?:dr\.?|doctor)/i,
  ];

  for (const pattern of appointmentPatterns) {
    if (pattern.test(lower)) {
      return {
        type: 'appointment',
        keywords: [],
        originalQuery: text,
      };
    }
  }

  return null;
}

/**
 * Execute a vault query and return results
 */
export async function executeVaultQuery(query: VaultQuery): Promise<VaultToolResult> {
  // Check if vault is unlocked
  if (!vaultService.isUnlocked()) {
    return {
      success: false,
      message: 'Your secure vault is locked. Would you like to unlock it to access this information?',
      shouldSpeak: true,
    };
  }

  try {
    switch (query.type) {
      case 'account':
        return await lookupAccount(query.keywords);

      case 'document':
        return await lookupDocument(query.keywords);

      case 'medication':
        return await listMedications(query.keywords);

      case 'doctor':
        return await lookupDoctor(query.keywords);

      case 'appointment':
        return await getAppointments();

      case 'search':
        return await searchVault(query.keywords.join(' '));

      default:
        return {
          success: false,
          message: 'I couldn\'t understand what information you\'re looking for.',
        };
    }
  } catch (error) {
    console.error('Vault query error:', error);
    return {
      success: false,
      message: 'There was an error accessing your vault. Please try again.',
    };
  }
}

/**
 * Lookup account information
 */
async function lookupAccount(keywords: string[]): Promise<VaultToolResult> {
  const searchTerm = keywords.join(' ');
  const result = await vaultService.lookupAccount(searchTerm, searchTerm);

  if (!result.found) {
    return {
      success: false,
      message: `I couldn't find an account matching "${searchTerm}" in your vault. Would you like to add it?`,
      shouldSpeak: true,
    };
  }

  if (result.type === 'multiple') {
    const accounts = result.data?.accounts || [];
    const accountList = accounts.map((a: any) => a.name).join(', ');
    return {
      success: true,
      data: result.data,
      message: `I found multiple accounts: ${accountList}. Which one would you like?`,
      shouldSpeak: true,
    };
  }

  // Format the response nicely
  const data = result.data!;
  let response = `Here's your ${data.name} information:\n`;

  if (data.accountNumber) {
    response += `Account Number: ${data.accountNumber}\n`;
  }
  if (data.ifscCode) {
    response += `IFSC Code: ${data.ifscCode}\n`;
  }
  if (data.branchName) {
    response += `Branch: ${data.branchName}\n`;
  }
  if (data.customerCarePhone) {
    response += `Customer Care: ${data.customerCarePhone}`;
  }

  return {
    success: true,
    data: result.data,
    message: response.trim(),
    shouldSpeak: true,
  };
}

/**
 * Lookup document location
 */
async function lookupDocument(keywords: string[]): Promise<VaultToolResult> {
  const searchTerm = keywords.join(' ');
  const result = await vaultService.lookupDocumentLocation(searchTerm);

  if (!result.found) {
    return {
      success: false,
      message: `I couldn't find information about your ${searchTerm} documents. Would you like to add the location?`,
      shouldSpeak: true,
    };
  }

  const data = result.data!;
  let response = '';

  if (data.physicalLocation) {
    response = `Your ${data.name} is stored at: ${data.physicalLocation}`;
  } else if (data.hasDigitalCopy) {
    response = `I have a digital copy of your ${data.name}, but the physical location isn't recorded.`;
  } else {
    response = `I found your ${data.name} in the vault, but no location was recorded.`;
  }

  if (data.expiryDate) {
    response += `\nNote: This document expires on ${data.expiryDate}.`;
  }

  return {
    success: true,
    data: result.data,
    message: response,
    shouldSpeak: true,
  };
}

/**
 * List medications
 */
async function listMedications(keywords: string[]): Promise<VaultToolResult> {
  const result = await vaultService.listMedications();

  if (!result.found) {
    return {
      success: false,
      message: 'You don\'t have any medications recorded in your vault. Would you like to add some?',
      shouldSpeak: true,
    };
  }

  const meds = result.data!.medications;
  let response = `You have ${meds.length} medication${meds.length > 1 ? 's' : ''}:\n\n`;

  for (const med of meds) {
    response += `- ${med.name}: ${med.dosage}`;
    if (med.times && med.times.length > 0) {
      response += ` at ${med.times.join(', ')}`;
    }
    if (med.withFood) {
      response += ' (with food)';
    }
    response += '\n';
  }

  return {
    success: true,
    data: result.data,
    message: response.trim(),
    shouldSpeak: true,
  };
}

/**
 * Lookup doctor information
 */
async function lookupDoctor(keywords: string[]): Promise<VaultToolResult> {
  const searchTerm = keywords.join(' ');
  const result = await vaultService.lookupDoctor(searchTerm);

  if (!result.found) {
    return {
      success: false,
      message: `I couldn't find a doctor matching "${searchTerm}" in your vault.`,
      shouldSpeak: true,
    };
  }

  const data = result.data!;
  let response = `Dr. ${data.name} (${data.specialty}):\n`;

  if (data.clinic) {
    response += `Clinic: ${data.clinic}\n`;
  }
  if (data.phoneNumbers && data.phoneNumbers.length > 0) {
    response += `Phone: ${data.phoneNumbers[0]}\n`;
  }
  if (data.consultationHours) {
    response += `Hours: ${data.consultationHours}\n`;
  }
  if (data.nextVisit) {
    response += `Next appointment: ${data.nextVisit}`;
  }

  return {
    success: true,
    data: result.data,
    message: response.trim(),
    shouldSpeak: true,
  };
}

/**
 * Get upcoming appointments
 */
async function getAppointments(): Promise<VaultToolResult> {
  const result = await vaultService.getUpcomingAppointmentsForAI();

  if (!result.found) {
    return {
      success: false,
      message: 'You don\'t have any upcoming appointments scheduled.',
      shouldSpeak: true,
    };
  }

  const appointments = result.data!.appointments;
  let response = `You have ${appointments.length} upcoming appointment${appointments.length > 1 ? 's' : ''}:\n\n`;

  for (const appt of appointments) {
    response += `- ${appt.title}: ${formatDate(appt.date)} at ${appt.time}`;
    if (appt.location) {
      response += ` (${appt.location})`;
    }
    response += '\n';
  }

  if (appointments[0].preparationNotes) {
    response += `\nNote: ${appointments[0].preparationNotes}`;
  }

  return {
    success: true,
    data: result.data,
    message: response.trim(),
    shouldSpeak: true,
  };
}

/**
 * General search across vault
 */
async function searchVault(query: string): Promise<VaultToolResult> {
  const results = await vaultService.search(query);

  if (results.length === 0) {
    return {
      success: false,
      message: `I couldn't find anything matching "${query}" in your vault.`,
    };
  }

  let response = `Found ${results.length} result${results.length > 1 ? 's' : ''}:\n`;
  for (const result of results.slice(0, 5)) {
    response += `- ${result.title} (${result.type})`;
    if (result.subtitle) {
      response += `: ${result.subtitle}`;
    }
    response += '\n';
  }

  return {
    success: true,
    data: { results },
    message: response.trim(),
    shouldSpeak: true,
  };
}

/**
 * Format date for display
 */
function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow';
  }

  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format vault data for including in AI context
 */
export async function getVaultContextForAI(): Promise<string> {
  if (!vaultService.isUnlocked()) {
    return '';
  }

  try {
    const summary = await vaultService.getVaultSummary();
    let context = '\n\nKnowledge Vault Available:\n';
    context += `- ${summary.accounts} accounts stored\n`;
    context += `- ${summary.medications} active medications\n`;
    context += `- ${summary.doctors} doctors\n`;
    context += `- ${summary.appointments} upcoming appointments\n`;
    context += `- ${summary.documents} documents\n`;
    context += 'User can ask about any of these. Use vault tools to look up specific information.\n';

    return context;
  } catch {
    return '';
  }
}
