/**
 * Web mock for expo-contacts
 *
 * Web limitations:
 * - No direct access to device contacts on web
 * - Contact Picker API has very limited browser support
 * - Returns empty results on web
 */

export const Fields = {
  ID: 'id',
  Name: 'name',
  FirstName: 'firstName',
  MiddleName: 'middleName',
  LastName: 'lastName',
  MaidenName: 'maidenName',
  NamePrefix: 'namePrefix',
  NameSuffix: 'nameSuffix',
  Nickname: 'nickname',
  PhoneNumbers: 'phoneNumbers',
  Emails: 'emails',
  Addresses: 'addresses',
  SocialProfiles: 'socialProfiles',
  InstantMessageAddresses: 'instantMessageAddresses',
  UrlAddresses: 'urlAddresses',
  Company: 'company',
  JobTitle: 'jobTitle',
  Department: 'department',
  Birthday: 'birthday',
  Dates: 'dates',
  Relationships: 'relationships',
  Note: 'note',
  Image: 'image',
  RawImage: 'rawImage',
  ExtraNames: 'extraNames',
  ContactType: 'contactType',
} as const;

export const SortTypes = {
  FirstName: 'firstName',
  LastName: 'lastName',
  None: 'none',
} as const;

export const ContainerTypes = {
  Local: 'local',
  Exchange: 'exchange',
  CardDAV: 'cardDAV',
  Unassigned: 'unassigned',
} as const;

export const ContactTypes = {
  Person: 'person',
  Company: 'company',
} as const;

export interface Contact {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phoneNumbers?: Array<{
    id?: string;
    number?: string;
    label?: string;
    countryCode?: string;
    digits?: string;
  }>;
  emails?: Array<{
    id?: string;
    email?: string;
    label?: string;
  }>;
  image?: {
    uri?: string;
  };
  contactType?: string;
}

export interface ContactResponse {
  data: Contact[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PermissionResponse {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}

let hasShownWebWarning = false;
const showWebLimitationWarning = () => {
  if (!hasShownWebWarning && process.env.NODE_ENV === 'development') {
    console.debug('[Contacts] Contact access not available on web platform');
    hasShownWebWarning = true;
  }
};

/**
 * Request contacts permissions
 * Web: Always returns denied (no API available)
 */
export async function requestPermissionsAsync(): Promise<PermissionResponse> {
  showWebLimitationWarning();

  // Check if Contact Picker API is available (Chrome 80+)
  if ('contacts' in navigator && 'ContactsManager' in window) {
    return { status: 'granted', granted: true, canAskAgain: true };
  }

  return { status: 'denied', granted: false, canAskAgain: false };
}

/**
 * Get current permissions status
 */
export async function getPermissionsAsync(): Promise<PermissionResponse> {
  if ('contacts' in navigator && 'ContactsManager' in window) {
    return { status: 'granted', granted: true, canAskAgain: true };
  }
  return { status: 'denied', granted: false, canAskAgain: false };
}

/**
 * Get contacts from device
 * Web: Returns empty array (no direct access to contacts)
 */
export async function getContactsAsync(options?: {
  fields?: string[];
  pageSize?: number;
  pageOffset?: number;
  sort?: string;
}): Promise<ContactResponse> {
  showWebLimitationWarning();

  // Try Contact Picker API if available (requires user gesture)
  // This is a limited API that shows a picker UI
  if ('contacts' in navigator && 'ContactsManager' in window) {
    try {
      const props = ['name', 'tel'];
      const contacts = await (navigator as any).contacts.select(props, { multiple: true });

      const data: Contact[] = contacts.map((c: any, index: number) => ({
        id: `web_${index}`,
        name: c.name?.[0] || 'Unknown',
        phoneNumbers: c.tel?.map((num: string, i: number) => ({
          id: `phone_${i}`,
          number: num,
          label: 'mobile',
        })) || [],
      }));

      return { data, hasNextPage: false, hasPreviousPage: false };
    } catch (error) {
      // User cancelled or API error
      console.debug('[Contacts] Contact picker cancelled or failed:', error);
    }
  }

  return { data: [], hasNextPage: false, hasPreviousPage: false };
}

/**
 * Get a single contact by ID
 */
export async function getContactByIdAsync(id: string, fields?: string[]): Promise<Contact | undefined> {
  showWebLimitationWarning();
  return undefined;
}

/**
 * Add a new contact
 */
export async function addContactAsync(contact: Partial<Contact>): Promise<string> {
  showWebLimitationWarning();
  throw new Error('Adding contacts not supported on web');
}

/**
 * Update an existing contact
 */
export async function updateContactAsync(contact: Contact): Promise<string> {
  showWebLimitationWarning();
  throw new Error('Updating contacts not supported on web');
}

/**
 * Remove a contact
 */
export async function removeContactAsync(contactId: string): Promise<void> {
  showWebLimitationWarning();
  throw new Error('Removing contacts not supported on web');
}

/**
 * Present contact form
 */
export async function presentFormAsync(
  contactId?: string,
  contact?: Contact,
  formOptions?: any
): Promise<Contact | undefined> {
  showWebLimitationWarning();
  return undefined;
}

/**
 * Check if contacts are available
 */
export async function isAvailableAsync(): Promise<boolean> {
  return 'contacts' in navigator && 'ContactsManager' in window;
}

export default {
  Fields,
  SortTypes,
  ContainerTypes,
  ContactTypes,
  requestPermissionsAsync,
  getPermissionsAsync,
  getContactsAsync,
  getContactByIdAsync,
  addContactAsync,
  updateContactAsync,
  removeContactAsync,
  presentFormAsync,
  isAvailableAsync,
};
