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
  | 'permissions'
  | 'security_setup'
  | 'caregiver_invite'
  | 'complete';

/** Steps removed by the #13 onboarding consolidation; mapped forward for persisted state. */
const LEGACY_STEP_MAP: Record<string, OnboardingStep> = {
  permission_mic: 'permissions',
  permission_notify: 'permissions',
  quick_setup: 'permissions',
  voice_tutorial: 'permissions',
};

export interface QuickSetupData {
  reminderTime?: string;
  trustedContactName?: string;
  trustedContactPhone?: string;
  medicalNotes?: string;
}

const SELF_STEPS: OnboardingStep[] = [
  'welcome_role',
  'language_voice',
  'permissions',
  'security_setup',
  'complete',
];

const CAREGIVER_STEPS: OnboardingStep[] = [
  'welcome_role',
  'language_voice',
  'permissions',
  'security_setup',
  'caregiver_invite',
  'complete',
];

class OnboardingStore {
  private completed: boolean = false;
  private currentStep: OnboardingStep = 'welcome_role';
  private role: OnboardingRole = 'self';
  private skipped: boolean = false;

  async initialize(): Promise<void> {
    try {
      const [complete, step, role, skipped] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.COMPLETE),
        AsyncStorage.getItem(STORAGE_KEYS.STEP),
        AsyncStorage.getItem(STORAGE_KEYS.ROLE),
        AsyncStorage.getItem(STORAGE_KEYS.SKIPPED),
      ]);

      this.completed = complete === 'true';
      this.currentStep = this.normalizeStep(
        (step as OnboardingStep) || null,
        (role as OnboardingRole) || 'self'
      );
      this.role = (role as OnboardingRole) || 'self';
      this.skipped = skipped === 'true';
    } catch (error) {
      console.error('OnboardingStore init error:', error);
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

  /** Map pre-consolidation steps (#13) to the current step lists. */
  private normalizeStep(
    step: string | null,
    role: OnboardingRole
  ): OnboardingStep {
    if (!step) return 'welcome_role';
    const mapped = (LEGACY_STEP_MAP[step] ?? step) as OnboardingStep;
    const steps = role === 'caregiver' ? CAREGIVER_STEPS : SELF_STEPS;
    return steps.includes(mapped) ? mapped : 'welcome_role';
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
