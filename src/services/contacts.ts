import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native';

export interface Contact {
  id: string;
  name: string;
  phoneNumbers: string[];
  thumbnailPath?: string;
}

export interface ContactSearchResult {
  contact: Contact;
  matchScore: number;
  matchedName: string;
}

/**
 * Contacts service for reading and searching device contacts
 * Note: Requires react-native-contacts package for native functionality
 */
class ContactsService {
  private contacts: Contact[] = [];
  private isLoaded: boolean = false;
  private permissionGranted: boolean = false;

  /**
   * Request contact permission
   */
  async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      // Web doesn't have contact access - use mock data
      this.permissionGranted = true;
      return true;
    }

    if (Platform.OS === 'android') {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
          {
            title: 'Contact Permission',
            message:
              'Karuna needs access to your contacts so you can easily call or message your family and friends.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        this.permissionGranted = result === PermissionsAndroid.RESULTS.GRANTED;
        return this.permissionGranted;
      } catch (error) {
        console.error('Contact permission error:', error);
        return false;
      }
    }

    // iOS - permission is requested when we try to access contacts
    this.permissionGranted = true;
    return true;
  }

  /**
   * Load contacts from device
   */
  async loadContacts(): Promise<Contact[]> {
    if (!this.permissionGranted) {
      const granted = await this.requestPermission();
      if (!granted) {
        return [];
      }
    }

    if (Platform.OS === 'web') {
      // Return mock contacts for web testing
      this.contacts = this.getMockContacts();
      this.isLoaded = true;
      return this.contacts;
    }

    try {
      // For native, we would use react-native-contacts here
      // This is a placeholder that returns mock data
      // In production, replace with: const contacts = await Contacts.getAll();
      this.contacts = this.getMockContacts();
      this.isLoaded = true;
      return this.contacts;
    } catch (error) {
      console.error('Error loading contacts:', error);
      return [];
    }
  }

  /**
   * Get all loaded contacts
   */
  getContacts(): Contact[] {
    return this.contacts;
  }

  /**
   * Search contacts by name with fuzzy matching
   */
  searchContacts(query: string): ContactSearchResult[] {
    if (!query.trim()) {
      return [];
    }

    const normalizedQuery = this.normalizeString(query);
    const results: ContactSearchResult[] = [];

    for (const contact of this.contacts) {
      const normalizedName = this.normalizeString(contact.name);
      const score = this.calculateMatchScore(normalizedQuery, normalizedName);

      if (score > 0.3) {
        results.push({
          contact,
          matchScore: score,
          matchedName: contact.name,
        });
      }
    }

    // Sort by match score (highest first)
    results.sort((a, b) => b.matchScore - a.matchScore);

    return results;
  }

  /**
   * Find a single contact by name (best match)
   */
  findContact(name: string): Contact | null {
    const results = this.searchContacts(name);
    if (results.length > 0 && results[0].matchScore > 0.5) {
      return results[0].contact;
    }
    return null;
  }

  /**
   * Find contacts matching a relationship term (son, daughter, mom, etc.)
   */
  findByRelationship(relationship: string): ContactSearchResult[] {
    const relationshipMappings: Record<string, string[]> = {
      son: ['son', 'beta', 'boy'],
      daughter: ['daughter', 'beti', 'girl'],
      mom: ['mom', 'mother', 'maa', 'amma', 'mama'],
      dad: ['dad', 'father', 'papa', 'baba', 'abba'],
      wife: ['wife', 'spouse'],
      husband: ['husband', 'spouse'],
      brother: ['brother', 'bhai', 'bro'],
      sister: ['sister', 'behen', 'sis'],
      doctor: ['doctor', 'dr', 'doc'],
      emergency: ['emergency', 'sos', '911', '100'],
    };

    const normalized = relationship.toLowerCase().trim();
    const keywords = relationshipMappings[normalized] || [normalized];

    const results: ContactSearchResult[] = [];

    for (const contact of this.contacts) {
      const normalizedName = this.normalizeString(contact.name);

      for (const keyword of keywords) {
        if (normalizedName.includes(keyword)) {
          results.push({
            contact,
            matchScore: 0.8,
            matchedName: contact.name,
          });
          break;
        }
      }
    }

    return results;
  }

  /**
   * Normalize string for comparison
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ');
  }

  /**
   * Calculate fuzzy match score between query and name
   */
  private calculateMatchScore(query: string, name: string): number {
    // Exact match
    if (name === query) {
      return 1.0;
    }

    // Name contains query
    if (name.includes(query)) {
      return 0.9;
    }

    // Query contains name
    if (query.includes(name)) {
      return 0.8;
    }

    // Word-by-word matching
    const queryWords = query.split(' ');
    const nameWords = name.split(' ');

    let matchedWords = 0;
    for (const qWord of queryWords) {
      for (const nWord of nameWords) {
        if (nWord.includes(qWord) || qWord.includes(nWord)) {
          matchedWords++;
          break;
        }

        // Levenshtein distance for fuzzy matching
        if (this.levenshteinDistance(qWord, nWord) <= 2) {
          matchedWords += 0.7;
          break;
        }
      }
    }

    return matchedWords / Math.max(queryWords.length, nameWords.length);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Mock contacts for testing
   */
  private getMockContacts(): Contact[] {
    return [
      { id: '1', name: 'Ravi (Son)', phoneNumbers: ['+1234567890'] },
      { id: '2', name: 'Priya (Daughter)', phoneNumbers: ['+1234567891'] },
      { id: '3', name: 'Dr. Sharma', phoneNumbers: ['+1234567892'] },
      { id: '4', name: 'Meera (Wife)', phoneNumbers: ['+1234567893'] },
      { id: '5', name: 'Amit Kumar', phoneNumbers: ['+1234567894'] },
      { id: '6', name: 'Sunita Devi (Mom)', phoneNumbers: ['+1234567895'] },
      { id: '7', name: 'Emergency Services', phoneNumbers: ['911', '100'] },
      { id: '8', name: 'Pharmacy - MedPlus', phoneNumbers: ['+1234567896'] },
      { id: '9', name: 'Neighbor - Mrs. Gupta', phoneNumbers: ['+1234567897'] },
      { id: '10', name: 'Bank - HDFC', phoneNumbers: ['1800123456'] },
    ];
  }

  /**
   * Check if contacts are loaded
   */
  isContactsLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Check if permission is granted
   */
  hasPermission(): boolean {
    return this.permissionGranted;
  }
}

export const contactsService = new ContactsService();
export default contactsService;
