# Mobile App — Bug Fixes & UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 bugs and UX issues in the Karuna mobile app: PIN auto-submit mismatch, PIN recovery (LockScreen + VaultScreen), lockout persistence, vault pagination, settings error surfacing, proactive settings feedback, and care circle pagination.

**Architecture:** All fixes are isolated to existing components and context — no new screens needed. LockScreen changes touch only `src/components/LockScreen.tsx`. Vault PIN recovery touches `src/components/VaultScreen.tsx`. Pagination is a local `FlatList` refactor within each vault category screen.

**Tech Stack:** React Native, Expo SDK 54, TypeScript, AsyncStorage (`@react-native-async-storage/async-storage`)

---

## Task 1: Fix LockScreen PIN auto-submit for 6-digit PINs

**Files:**
- Modify: `src/components/LockScreen.tsx`

**Problem:** `handlePinInput` auto-submits at exactly 4 digits (line 89), but vault PINs can be 4–6 digits. A 6-digit PIN always fails at 4 digits, burning through attempts and causing a lockout.

- [ ] **Step 1: Replace auto-submit with explicit Confirm button**

In `src/components/LockScreen.tsx`, replace the `handlePinInput` function and add a Confirm button:

```typescript
const handlePinInput = (digit: string) => {
  if (isLocked) return;
  if (pin.length >= 8) return;
  setPin((prev) => prev + digit);
  setError('');
};

const handleConfirm = () => {
  if (pin.length < 4) {
    setError('PIN must be at least 4 digits');
    return;
  }
  verifyPin(pin);
};
```

Replace `renderPinDots` to show filled dots up to `pin.length` with a max of 8:

```typescript
const renderPinDots = () => {
  const dotCount = Math.max(4, pin.length);
  return Array.from({ length: dotCount }, (_, i) => (
    <View
      key={i}
      style={[
        styles.pinDot,
        i < pin.length && styles.pinDotFilled,
        error && styles.pinDotError,
      ]}
    />
  ));
};
```

Add the Confirm button to the keypad JSX, between the keypad `View` and the biometric button:

```tsx
<TouchableOpacity
  style={[styles.confirmButton, pin.length < 4 && styles.buttonDisabled]}
  onPress={handleConfirm}
  disabled={isLocked || pin.length < 4}
>
  <Text style={styles.confirmButtonText}>Confirm</Text>
</TouchableOpacity>
```

Add styles:

```typescript
confirmButton: {
  backgroundColor: '#4A90A4',
  paddingVertical: 16,
  paddingHorizontal: 48,
  borderRadius: 12,
  marginBottom: 16,
  minWidth: 160,
  alignItems: 'center',
},
confirmButtonText: {
  color: '#fff',
  fontSize: 20,
  fontWeight: '700',
},
buttonDisabled: {
  opacity: 0.4,
},
```

- [ ] **Step 2: Build and verify TypeScript compiles**

```bash
cd G:/twine/karuna2026
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: 0 errors related to LockScreen.

- [ ] **Step 3: Commit**

```bash
git add src/components/LockScreen.tsx
git commit -m "fix(lock): remove 4-digit auto-submit, add explicit Confirm button for 6-digit PINs"
```

---

## Task 2: Add "Forgot PIN?" recovery to LockScreen

**Files:**
- Modify: `src/components/LockScreen.tsx`

**Problem:** After 5 failed attempts and 30s lockout, there is no way to recover. The user is permanently locked out until they reinstall.

- [ ] **Step 1: Add Forgot PIN button below the keypad**

After the biometric button block and before the closing `</View>`, add:

```tsx
<TouchableOpacity
  style={styles.forgotPinButton}
  onPress={handleForgotPin}
>
  <Text style={styles.forgotPinText}>Forgot PIN?</Text>
</TouchableOpacity>
```

- [ ] **Step 2: Implement handleForgotPin**

Add after `handleBiometricAuth`:

```typescript
const handleForgotPin = () => {
  Alert.alert(
    'Reset PIN',
    'This will erase your PIN and all locked data. You will need to set up a new PIN. Are you sure?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset & Continue',
        style: 'destructive',
        onPress: async () => {
          await biometricAuthService.resetAllSecurity();
          onUnlock();
        },
      },
    ]
  );
};
```

- [ ] **Step 3: Add `resetAllSecurity` to biometricAuthService if missing**

Open `src/services/biometricAuth.ts` and check if `resetAllSecurity` exists. If not, add:

```typescript
async resetAllSecurity(): Promise<void> {
  await AsyncStorage.multiRemove([
    '@karuna/security_settings',
    '@karuna/pin_hash',
  ]);
}
```

- [ ] **Step 4: Add styles**

```typescript
forgotPinButton: {
  marginTop: 24,
  padding: 12,
},
forgotPinText: {
  fontSize: 16,
  color: '#4A90A4',
  textDecorationLine: 'underline',
},
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/LockScreen.tsx src/services/biometricAuth.ts
git commit -m "fix(lock): add Forgot PIN recovery that resets security settings"
```

---

## Task 3: Persist lockout state across app restarts

**Files:**
- Modify: `src/components/LockScreen.tsx`

**Problem:** `attempts` and `isLocked` are in-memory React state. Closing and reopening the app resets the counter, defeating the lockout.

- [ ] **Step 1: Add AsyncStorage import**

At the top of `src/components/LockScreen.tsx`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
```

- [ ] **Step 2: Replace in-memory lockout with AsyncStorage-backed state**

Replace the existing `useEffect` that handles the countdown and `verifyPin` function:

```typescript
const LOCKOUT_KEY = '@karuna/lockout_state';

useEffect(() => {
  // Load persisted lockout state on mount
  AsyncStorage.getItem(LOCKOUT_KEY).then((raw) => {
    if (!raw) return;
    const { lockedUntil, attempts: savedAttempts } = JSON.parse(raw);
    const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
    if (remaining > 0) {
      setIsLocked(true);
      setLockTimer(remaining);
      setAttempts(savedAttempts);
    } else {
      AsyncStorage.removeItem(LOCKOUT_KEY);
    }
  });
}, []);

useEffect(() => {
  if (isLocked && lockTimer > 0) {
    const timer = setInterval(() => {
      setLockTimer((prev) => {
        if (prev <= 1) {
          setIsLocked(false);
          setAttempts(0);
          AsyncStorage.removeItem(LOCKOUT_KEY);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }
}, [isLocked, lockTimer]);

const verifyPin = async (pinToVerify: string) => {
  const result = await biometricAuthService.verifyPIN(pinToVerify);

  if (result.success) {
    await AsyncStorage.removeItem(LOCKOUT_KEY);
    onUnlock();
  } else {
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setPin('');
    shake();

    if (newAttempts >= 5) {
      const lockedUntil = Date.now() + 30_000;
      await AsyncStorage.setItem(LOCKOUT_KEY, JSON.stringify({ lockedUntil, attempts: newAttempts }));
      setIsLocked(true);
      setLockTimer(30);
      setAttempts(0);
      setError('Too many attempts. Please wait.');
    } else {
      setError(`Incorrect PIN. ${5 - newAttempts} attempts remaining.`);
    }
  }
};
```

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/LockScreen.tsx
git commit -m "fix(lock): persist lockout state in AsyncStorage across app restarts"
```

---

## Task 4: Add "Forgot PIN?" recovery to VaultScreen

**Files:**
- Modify: `src/components/VaultScreen.tsx`

**Problem:** The PIN unlock modal (`showPinModal`) has no recovery option. If the user forgets their vault PIN, they cannot access the vault without reinstalling.

- [ ] **Step 1: Add Forgot PIN link to the PIN modal**

In `src/components/VaultScreen.tsx`, inside the `<Modal>` block, after the `<View style={styles.modalButtons}>...</View>`, add:

```tsx
{!isCreatingVault && (
  <TouchableOpacity
    style={styles.forgotPinLink}
    onPress={handleForgotVaultPin}
  >
    <Text style={styles.forgotPinLinkText}>Forgot vault PIN?</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 2: Implement handleForgotVaultPin**

Add after `handleLock`:

```typescript
const handleForgotVaultPin = () => {
  Alert.alert(
    'Delete Vault',
    'Resetting the vault PIN will permanently delete all vault data. This cannot be undone. Are you sure?',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Vault',
        style: 'destructive',
        onPress: async () => {
          await vaultService.deleteVault();
          setHasVault(false);
          setIsLocked(true);
          setShowPinModal(false);
          setPin('');
          setSummary(null);
        },
      },
    ]
  );
};
```

- [ ] **Step 3: Add `deleteVault` to vaultService if missing**

Open `src/services/vault.ts` and check if `deleteVault` exists. If not, add:

```typescript
async deleteVault(): Promise<void> {
  await AsyncStorage.multiRemove([
    '@karuna/vault_pin_hash',
    '@karuna/vault_data',
    '@karuna/vault_exists',
  ]);
  this._isUnlocked = false;
}
```

- [ ] **Step 4: Add styles to VaultScreen**

```typescript
forgotPinLink: {
  marginTop: 16,
  alignItems: 'center',
},
forgotPinLinkText: {
  fontSize: 14,
  color: '#999',
  textDecorationLine: 'underline',
},
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/components/VaultScreen.tsx src/services/vault.ts
git commit -m "fix(vault): add Forgot PIN recovery that deletes and resets the vault"
```

---

## Task 5: VaultMedicationScreen — add "Load More" pagination

**Files:**
- Modify: `src/components/VaultMedicationScreen.tsx`

**Problem:** `loadMedications()` calls `vaultService.getMedications()` which returns all records. For users with 50+ medications this renders everything at once.

- [ ] **Step 1: Add FlatList import and pagination state**

At the top of `src/components/VaultMedicationScreen.tsx`, replace:

```typescript
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
```

with:

```typescript
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
```

- [ ] **Step 2: Add pagination state**

Inside the component, after the existing state declarations, add:

```typescript
const PAGE_SIZE = 20;
const [page, setPage] = useState(1);
const [allMedications, setAllMedications] = useState<VaultMedication[]>([]);
const [hasMore, setHasMore] = useState(false);
```

- [ ] **Step 3: Replace loadMedications with paginated version**

```typescript
const loadMedications = async (reset = true) => {
  const pageToLoad = reset ? 1 : page;
  if (reset) {
    setPage(1);
    setIsLoading(true);
  }
  try {
    const data = await vaultService.getMedications();
    if (reset) {
      setAllMedications(data);
      setMedications(data.slice(0, PAGE_SIZE));
      setHasMore(data.length > PAGE_SIZE);
    }
  } catch (error) {
    console.error('Failed to load medications:', error);
  }
  setIsLoading(false);
};

const loadMore = () => {
  const nextPage = page + 1;
  const nextItems = allMedications.slice(0, nextPage * PAGE_SIZE);
  setMedications(nextItems);
  setPage(nextPage);
  setHasMore(allMedications.length > nextPage * PAGE_SIZE);
};
```

- [ ] **Step 4: Replace the medication list ScrollView with FlatList**

Find the section that renders the medications list (after the `showForm` check) and replace the `<ScrollView>` wrapping medication items with:

```tsx
{!showForm && (
  <FlatList
    data={medications}
    keyExtractor={(item) => item.id}
    renderItem={({ item }) => (
      <MedicationItem
        medication={item}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    )}
    ListFooterComponent={
      hasMore ? (
        <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore}>
          <Text style={styles.loadMoreText}>Load More</Text>
        </TouchableOpacity>
      ) : null
    }
    ListEmptyComponent={
      !isLoading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No medications added yet</Text>
        </View>
      ) : null
    }
  />
)}
```

- [ ] **Step 5: Add styles**

```typescript
loadMoreButton: {
  padding: 16,
  alignItems: 'center',
  backgroundColor: '#E3F2FD',
  borderRadius: 8,
  margin: 16,
},
loadMoreText: {
  color: '#1976D2',
  fontSize: 16,
  fontWeight: '600',
},
emptyState: {
  padding: 40,
  alignItems: 'center',
},
emptyText: {
  fontSize: 18,
  color: '#999',
},
```

- [ ] **Step 6: Build check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add src/components/VaultMedicationScreen.tsx
git commit -m "fix(vault): paginate medication list with Load More (20 per page)"
```

---

## Task 6: Surface settings load errors to user

**Files:**
- Modify: `src/context/SettingsContext.tsx`

**Problem:** If `storageService.loadSettings()` fails (e.g., corrupt JSON on device), the error is silently caught and default settings are used. The user has no idea their custom settings were lost.

- [ ] **Step 1: Add error state to SettingsContext value**

In `src/context/SettingsContext.tsx`, add `settingsLoadError` to the context value interface:

```typescript
interface SettingsContextValue {
  settings: AppSettings;
  isLoading: boolean;
  settingsLoadError: boolean;
  // ... rest of existing interface
```

- [ ] **Step 2: Add error state and surface it**

Inside `SettingsProvider`, add state:

```typescript
const [settingsLoadError, setSettingsLoadError] = useState(false);
```

In the `loadSettings` function, update the catch block:

```typescript
      } catch (error) {
        console.error('Error loading settings:', error);
        setSettingsLoadError(true);
      } finally {
        setIsLoading(false);
      }
```

- [ ] **Step 3: Expose the error in context value**

In the `SettingsContext.Provider` value prop, add `settingsLoadError`:

```tsx
<SettingsContext.Provider
  value={{
    settings,
    isLoading,
    settingsLoadError,
    // ... rest of existing values
  }}
>
```

- [ ] **Step 4: Show a one-time alert in App.tsx when error occurs**

Open `src/App.tsx` and add an effect that watches `settingsLoadError`:

```typescript
import { useSettings } from './context/SettingsContext';

// Inside the App component:
const { settingsLoadError } = useSettings();

useEffect(() => {
  if (settingsLoadError) {
    Alert.alert(
      'Settings Reset',
      'Your settings could not be loaded and have been reset to defaults.',
      [{ text: 'OK' }]
    );
  }
}, [settingsLoadError]);
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/context/SettingsContext.tsx src/App.tsx
git commit -m "fix(settings): surface settings load errors to user via Alert"
```

---

## Task 7: ProactiveSettings — add visual save confirmation

**Files:**
- Modify: `src/components/ProactiveSettingsScreen.tsx`

**Problem:** Toggling a proactive setting calls `updatePreferences` and updates state silently. The user gets no confirmation that the change was saved.

- [ ] **Step 1: Add saved toast state**

In `src/components/ProactiveSettingsScreen.tsx`, add state at the top of the component:

```typescript
const [savedToast, setSavedToast] = useState(false);
```

- [ ] **Step 2: Show toast after updatePreference**

Update `updatePreference`:

```typescript
const updatePreference = useCallback(
  async <K extends keyof ProactivePreferences>(
    key: K,
    value: ProactivePreferences[K]
  ) => {
    if (!preferences) return;
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    await proactiveEngineService.updatePreferences({ [key]: value });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  },
  [preferences]
);
```

Also update `updateCategory` the same way:

```typescript
const updateCategory = useCallback(
  async (category: keyof ProactivePreferences['categories'], value: boolean) => {
    if (!preferences) return;
    const updatedCategories = { ...preferences.categories, [category]: value };
    const updated = { ...preferences, categories: updatedCategories };
    setPreferences(updated);
    await proactiveEngineService.updatePreferences({ categories: updatedCategories });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  },
  [preferences]
);
```

- [ ] **Step 3: Render the toast**

At the bottom of the JSX, before the closing `</ScrollView>` or outer `<View>`, add:

```tsx
{savedToast && (
  <View style={styles.savedToast}>
    <Text style={styles.savedToastText}>Saved</Text>
  </View>
)}
```

- [ ] **Step 4: Add toast styles**

```typescript
savedToast: {
  position: 'absolute',
  bottom: 40,
  alignSelf: 'center',
  backgroundColor: 'rgba(76, 175, 80, 0.9)',
  paddingHorizontal: 24,
  paddingVertical: 12,
  borderRadius: 24,
},
savedToastText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '600',
},
```

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ProactiveSettingsScreen.tsx
git commit -m "fix(proactive): show 'Saved' toast after preference updates"
```

---

## Task 8: CareCircleScreen — check and fix pagination

**Files:**
- Modify: `src/components/CareCircleScreen.tsx`

- [ ] **Step 1: Read the current implementation**

Open `src/components/CareCircleScreen.tsx` and check how care circles are fetched. Look for the fetch call and whether `page` / `limit` params are used.

- [ ] **Step 2: If all circles load at once, add pagination**

If `loadCircles()` fetches without pagination, add the same Load More pattern as Task 5:

```typescript
const PAGE_SIZE = 10;
const [allCircles, setAllCircles] = useState<any[]>([]);
const [visibleCircles, setVisibleCircles] = useState<any[]>([]);
const [hasMore, setHasMore] = useState(false);

const loadCircles = async () => {
  setIsLoading(true);
  try {
    const data = await circleService.getCircles(); // or whatever the actual call is
    setAllCircles(data);
    setVisibleCircles(data.slice(0, PAGE_SIZE));
    setHasMore(data.length > PAGE_SIZE);
  } catch (e) {
    console.error('Failed to load circles:', e);
  }
  setIsLoading(false);
};

const loadMore = () => {
  const next = visibleCircles.length + PAGE_SIZE;
  setVisibleCircles(allCircles.slice(0, next));
  setHasMore(allCircles.length > next);
};
```

Replace the `circles` reference in the list render with `visibleCircles`, and add a Load More button as in Task 5.

- [ ] **Step 3: Build check**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/CareCircleScreen.tsx
git commit -m "fix(circles): add Load More pagination to care circle list"
```
