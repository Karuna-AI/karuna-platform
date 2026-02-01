import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  COMPLETE: '@karuna_onboarding_complete',
  STEP: '@karuna_onboarding_step',
  ROLE: '@karuna_onboarding_role',
  SKIPPED: '@karuna_onboarding_skipped',
  MIC_GRANTED: '@karuna_onboarding_mic_granted',
  NOTIFY_GRANTED: '@karuna_onboarding_notify_granted',
  SECURITY_METHOD: '@karuna_onboarding_security_method',
  QUICK_SETUP: '@karuna_onboarding_quick_setup',
} as const;

export type OnboardingRole = 'self' | 'caregiver';

export type OnboardingStep =
  | 'welcome_role'
  | 'language_voice'
  | 'permission_mic'
  | 'permission_notify'
  | 'security_setup'
  | 'quick_setup'
  | 'caregiver_invite'
  | 'voice_tutorial'
  | 'complete';

export interface QuickSetupData {
  reminderTime?: string;
  trustedContactName?: string;
  trustedContactPhone?: string;
  medicalNotes?: string;
}

const SELF_STEPS: OnboardingStep[] = [
  'welcome_role',
  'language_voice',
  'permission_mic',
  'permission_notify',
  'security_setup',
  'quick_setup',
  'voice_tutorial',
  'complete',
];

const CAREGIVER_STEPS: OnboardingStep[] = [
  'welcome_role',
  'language_voice',
  'permission_mic',
  'permission_notify',
  'security_setup',
  'quick_setup',
  'caregiver_invite',
  'voice_tutorial',
  'complete',
];

class OnboardingStore {
  private completed: boolean = false;
  private currentStep: OnboardingStep = 'welcome_role';
  private role: OnboardingRole = 'self';
  private skipped: boolean = false;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    try {
      const [complete, step, role, skipped] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.COMPLETE),
        AsyncStorage.getItem(STORAGE_KEYS.STEP),
        AsyncStorage.getItem(STORAGE_KEYS.ROLE),
        AsyncStorage.getItem(STORAGE_KEYS.SKIPPED),
      ]);

      this.completed = complete === 'true';
      this.currentStep = (step as OnboardingStep) || 'welcome_role';
      this.role = (role as OnboardingRole) || 'self';
      this.skipped = skipped === 'true';
      this.initialized = true;
    } catch (error) {
      console.error('OnboardingStore init error:', error);
      this.initialized = true;
    }
  }

  isComplete(): boolean {
    return this.completed;
  }

  getRole(): OnboardingRole {
    return this.role;
  }

  getCurrentStep(): OnboardingStep {
    return this.currentStep;
  }

  wasSkipped(): boolean {
    return this.skipped;
  }

  getStepsForRole(role: OnboardingRole): OnboardingStep[] {
    return role === 'caregiver' ? [...CAREGIVER_STEPS] : [...SELF_STEPS];
  }

  async setRole(role: OnboardingRole): Promise<void> {
    this.role = role;
    await AsyncStorage.setItem(STORAGE_KEYS.ROLE, role);
  }

  async setStep(step: OnboardingStep): Promise<void> {
    this.currentStep = step;
    await AsyncStorage.setItem(STORAGE_KEYS.STEP, step);
  }

  async setPermissionResult(key: 'mic' | 'notify', granted: boolean): Promise<void> {
    const storageKey = key === 'mic' ? STORAGE_KEYS.MIC_GRANTED : STORAGE_KEYS.NOTIFY_GRANTED;
    await AsyncStorage.setItem(storageKey, granted ? 'true' : 'false');
  }

  async setSecurityMethod(method: 'biometric' | 'pin' | 'none'): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.SECURITY_METHOD, method);
  }

  async getSecurityMethod(): Promise<'biometric' | 'pin' | 'none'> {
    try {
      const method = await AsyncStorage.getItem(STORAGE_KEYS.SECURITY_METHOD);
      return (method as 'biometric' | 'pin' | 'none') || 'none';
    } catch {
      return 'none';
    }
  }

  async setQuickSetupData(data: QuickSetupData): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.QUICK_SETUP, JSON.stringify(data));
  }

  async getQuickSetupData(): Promise<QuickSetupData | null> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.QUICK_SETUP);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async markComplete(skipped: boolean = false): Promise<void> {
    this.completed = true;
    this.skipped = skipped;
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.COMPLETE, 'true'),
      AsyncStorage.setItem(STORAGE_KEYS.SKIPPED, skipped ? 'true' : 'false'),
    ]);
  }

  async reset(): Promise<void> {
    this.completed = false;
    this.currentStep = 'welcome_role';
    this.role = 'self';
    this.skipped = false;
    await Promise.all(
      Object.values(STORAGE_KEYS).map((key) => AsyncStorage.removeItem(key))
    );
  }
}

export const onboardingStore = new OnboardingStore();
export default onboardingStore;
