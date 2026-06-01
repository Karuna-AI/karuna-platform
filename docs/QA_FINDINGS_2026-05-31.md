# Karuna — Full-App QA Walkthrough & Issue Tracker (2026-05-31)

Device: Samsung Galaxy A21s (Android 12), preview build (all fixes), against PROD.
Status legend: [ ] open · [x] fixed/shipped · [~] in progress

> **Test-device vault PIN reset to `2580` on 2026-06-01** (old PIN unknown to tester
> and owner; vault was empty so reset via "Forgot vault PIN?" lost no data). This
> also live-verified the recovery flow → see H3.

## Issues to fix (todos)

### 🔴 HIGH
- [x] **H1 — Vault data added on device never syncs to the care circle. FIXED (code, commit 2eed198).**
  `careCircleSync.trackChange` had zero callers; vault writes stayed local
  (verified live: vault_accounts=0, sync_changes=0). Fix: vault now emits a
  change event after every mutation → careCircleSync maps it (new `vaultSyncMap`,
  camelCase→snake_case to the server's column whitelist) → trackChange → sync.
  Covers doctor/medication/appointment/contact; account & document excluded
  (server *_encrypted columns + caregivers can't edit). Client `generateId()` →
  UUID and server `create` reuses it (ON CONFLICT idempotent) so update/delete
  match. Unit-tested (12 cases). **Needs next mobile build to verify device→portal E2E.**
- [x] **H2 — Chat could not answer "what day is it?" (emitted a literal
  `[insert current date here]` placeholder).** Root cause: the chat pipeline
  (`useChat.ts`) injected weather/vault/health context into the user turn but
  **never the current date**, and LLMs have no inherent knowledge of "today".
  Observed live on-device 2026-05-31 (weather was correct, date was a placeholder).
  Fix: added `buildDateContext()` and inject `[Today is …, current time …]` every
  turn (`__tests__/hooks/chatDateContext.test.ts`). **Needs next build to verify on-device.**

- [~] **H3 — Vault PIN recovery. IN PROGRESS (caregiver-assisted chosen).**
  Done: (a) explicit no-recovery warning at PIN setup; (b) **Phase 1 — DEK key model**
  (data key decoupled from PIN; PIN change/recovery re-wraps the DEK instead of
  re-encrypting; legacy vaults migrate by freezing the old key as the DEK; also fixed a
  latent changePin data-orphaning bug). Design: docs/VAULT_PIN_RECOVERY_DESIGN.md.
  Remaining: **Phase 2** (escrow DEK to server) + **Phase 3** (portal owner-approval +
  device recovery flow) — a multi-component build (mobile + gateway + caregiver portal).
  The only recovery path is `Forgot vault PIN?` → `vault.deleteVault()` →
  `encryptionService.resetVault()`, which **wipes all vault contents** (accounts,
  doctors, documents, medications, appointments, contacts) because the encryption
  key is derived solely from the PIN. For Karuna's target users (elderly /
  memory-impaired) forgetting a PIN is *expected*, not an edge case — so the most
  vulnerable users are one memory lapse away from losing their most important data.
  Surfaced live 2026-06-01 when neither tester nor owner could recall the device PIN.
  **Recommended design (fits existing architecture):**
  1. **Caregiver-assisted recovery via the care circle** — escrow a recovery key
     encrypted to the circle *owner*; owner authorizes a reset the elder confirms.
     The app already has an owner/caregiver trust model + backend auth.
  2. **Recovery phrase at setup** — show a one-time recovery code the caregiver stores.
  3. **Lean on biometrics** — Face ID / fingerprint already exist as unlock; make
     them the primary path so the PIN is rarely entered (and thus rarely forgotten).
  4. At minimum: a **loud, explicit warning** at PIN setup that there is NO recovery
     and forgetting it loses all data (current copy does not say this).

### 🟠 MEDIUM
- [x] **M1 — Consent controls shown to non-owner members. FIXED (re-fixed 2026-06-01).**
  First attempt used `onboardingStore.getRole()` — on-device QA found it ineffective
  (a caregiver onboarded as 'self' still saw editable owner toggles). Re-fixed to source
  edit-permission from **care-circle ownership** via `careCircleSync.getMyCircleRole()`
  (/auth/me, cached); a circle member — including role-not-yet-resolved — is read-only.
- [x] **M2 — Patient/owner framing regardless of role. FIXED (re-fixed 2026-06-01).**
  Consent screen reframes for caregivers; now driven by the circle role (see M1).
- [x] **N1 — Vault grid counts stale after add (showed "0 items" until full reload). FIXED.**
  Screen stays mounted in the stack; navigator now bumps a `refreshKey` via `useFocusEffect`
  so the grid reloads its summary on refocus.
- [x] **N2 — Care Circle "Offline" right after a successful sync. FIXED.** Status required
  an open WebSocket; now reports connected when the WS is open OR the last REST sync
  succeeded (WS is only a realtime-nudge channel). +2 tests.
- [x] **N3 — Care Circle copy owner-framed for caregivers. FIXED.** Sync/Leave/About copy
  reframed by circle role (same source as M1/M2).
- [x] **M3 — "Sync Health Data" gives no feedback. FIXED.** Always alerts now:
  synced N / up-to-date / error (pure helper `syncHealthResultMessage` + 5 tests).

- [x] **M4 — Vault category delete doesn't refresh the list (looks broken). FIXED (commit 4f0094a).** Tapping
  Delete on a vault item (Accounts confirmed; same pattern in Doctors/Contacts/
  Documents/Appointments/Medications) removes & persists the item at the data layer
  (verified: lock→unlock reload shows it gone, grid count drops to 0) **but the
  deleted card stays visible** on the open list until you navigate away and back.
  Root cause: `vaultService.getX()` returns `this.data.X` *by reference* and
  `deleteX()` mutates it in place via `.splice()`; `loadX()` then does
  `setState(sameArrayRef)`, which React bails out of (`Object.is` equal → no
  re-render). Add/edit only refresh incidentally because `handleSave` toggles
  `setShowForm(false)`. **Fix:** return a copy from the getters (`return [...this.data!.X]`)
  or `setState([...data])` in each `loadX()`. Surfaced 2026-06-01 (Accounts).

### 🟡 LOW / cosmetic
- [x] **L1 — "Appointments" label wraps. FIXED (commit e0900e3).** Shrink-to-fit
  (`numberOfLines={1}` + `adjustsFontSizeToFit`); verified on-device 2026-06-01 (build 00b809b7).

## Vault CRUD verification (2026-06-01, device circle 9d4d87d7, PIN reset to 2580)
- [x] **Vault reset/recreate** — Forgot PIN → delete → Create Vault (4–6 digit) → Success
- [x] **Accounts — Add** ("QATestSavings", rich form: type/name*/institution/acct#/IFSC/branch/phone/notes) → "Account added successfully"
- [x] **Accounts — Edit** (added institution "QABank") → "Account updated successfully", persisted
- [x] **Accounts — Delete** → confirm dialog → removed & **persisted to encrypted storage** (survived lock/unlock reload) — but see M4 (no in-place list refresh)
- [x] **Lock Vault** — confirmation dialog ("Are you sure you want to lock your vault?")
- [x] **Re-unlock with new PIN 2580** — reload from encrypted storage OK → Hermes crypto fallback round-trips a full encrypt→persist→decrypt cycle ✅
- [x] **H1 cross-check** — "QATestSavings" never reached prod (`vault_accounts`=0, name match=0, `sync_changes`=0 for circle) — vault writes don't sync, confirmed live
- [x] **Doctors — Add** (DrQATest / General Physician / QAClinic; 11 specialties; required-name+clinic validation works) → "Doctor added successfully", list refreshed
- [x] **Doctors — Delete** → confirm dialog → data deleted (grid→0) but **M4 reproduced** (card stayed visible until navigate-away). Confirms M4 affects all categories, not just Accounts.
- [~] Contacts / Documents / Appointments — NOT individually driven, but verified via code to share the identical `getX/addX/deleteX/loadX/handleSave` pattern as Accounts+Doctors → same add/edit behavior, same M4 delete-refresh bug, same H1 no-sync gap apply. (Empty-state screens render; full CRUD not exercised on-device.)

> **Honest scope note:** Add/Edit/Delete were driven end-to-end on **Accounts** and **Doctors**. Contacts/Documents/Appointments were left at their (verified-rendering) empty states; their behaviour is inferred from shared code, not driven on-device. Voice STT round-trip could not be exercised headlessly (see checklist).

## Already fixed & shipped (PR #82 → master)
- [x] Mobile care-circle sync (token store/SecureStore + legacy migration)
- [x] Vault crypto fallback (Hermes/JSC) — vault create/unlock works
- [x] Prod dashboards `/api` proxy (Vercel) — verified live
- [x] Health vitals upload (device → prod, fires caregiver alerts)
- [x] Consent sync + error surfacing
- [x] Manual "Log Vital Reading" entry
- [x] Sync correctness (merge snake_case, GET /sync `since`, WS re-pull)
- [x] AI usage attribution + STT logging
- [x] Archival migration 005; registration email robustness; consent fail-closed
- [x] Release version bump (vc 9 / build 29)

## Screen/feature coverage checklist
- [x] Chat home (text, weather, history)
- [x] Chat — Type/send round-trip — **AI usage logged to prod with user_id attribution
      (live cross-check: row at 2026-05-31T22:02:39Z, user_id f21c5ca0…, success).**
- [x] Chat — Clear conversation (confirm dialog → wipes thread → empty state)
- [ ] Chat — Voice (hold to talk)
- [x] Health Dashboard (steps, meds, vitals, Log Vital, Sync Health Data) —
      **5 manual heart-rate readings device→prod health_data + 5 caregiver_alerts (cross-checked).**
- [ ] Health — Medications "View All" / detail
- [x] Vault — create/unlock/lock, category grid
- [x] Vault — Medications add
- [x] Vault — Accounts (add/edit/delete + persistence) & Doctors (add/delete) driven on-device; Documents/Appointments/Contacts inferred from shared code (see Vault CRUD section)
- [x] Vault — Voice STT: recording UI verified (Listening/timer/Stop/Cancel); STT→backend round-trip not exercisable headlessly
- [x] Family/Care Circle — Sync
- [x] Family — Leave Circle — verified confirm dialog only (CANCELLED; did NOT leave)
- [x] Settings — top prefs (text size, speech, language, voice, accessibility)
- [x] Settings — Add Emergency Contact (add "QA TestKin" → Primary → Delete w/ confirm; full lifecycle)
- [x] Settings — Security: Set Up PIN, Face ID (none enrolled warning), App Lock (off), Vault Lock (ON) — all render
- [x] Settings — Security: Activity Log (5 events; filters All/Security/Vault/Consent; logged caregiver_auth_token + database_encryption_key reads — cross-validates SecureStore token fix)
- [x] Settings — Privacy & Consent (toggle, category detail)
- [x] Settings — Check-In Settings (Proactive toggle, freq slider, types, Quiet Hours 10PM–7AM, Safety/Alert Level=High)
- [x] Settings — What Karuna Knows (name/mentions/instructions — empty state, "stored only on your device")
- [x] Settings — Reset to Defaults (confirm dialog → CANCELLED)

## Data-flow cross-check matrix (real-user verification vs prod DB)
| Action on device | Backend/DB landing | Verified |
|---|---|---|
| Send chat message | `ai_usage_logs` (tokens, model, latency, success, **user_id**) | ✅ live row 22:02:39Z, user_id populated |
| Log Vital Reading | `health_data` (+ `caregiver_alerts` when out-of-range) | ✅ 5 readings + 5 alerts in circle 9d4d87d7 |
| Care-circle Sync | `circle_members` / pull vault+notes | ✅ 2 members; pull works |
| Consent change (owner) | `care_circles` consent / PUT | ✅ owner path; non-owner 403 surfaced |
| Vault add (med/doctor/etc.) | (should be `care_circle_vault_items`) | ❌ **H1 — never leaves device** |
| Emergency contact / Settings prefs / Check-In / What Karuna Knows / Activity Log | local-only by design (AsyncStorage/SecureStore) | n/a — not a backend feature |

---

## ✅ vc9 on-device re-verification (2026-06-01, build af9e111d, versionCode 9, commit b30c4f9)

Installed the fixed preview build (`adb install -r`; confirmed running versionCode=9,
prior was vc8). Device = caregiver in circle `9d4d87d7`. Screen-recorded the whole session.
Baseline before testing: vault_doctors=0, vault_medications=0, sync_changes=0 (table empty).

- [x] **H2 — Chat date.** Sent a fresh "what day is it today?" on vc9 → reply
  **"Today is Monday, June 1, 2026."** (real date, correct DOW, no `[insert current date here]`).
  Cross-check: `ai_usage_logs` row at 2026-06-01T08:59:59Z, model gpt-4o-mini, success,
  858 tokens, user_id f21c5ca0 populated. **VERIFIED FIXED.**
- [x] **L1 — "Appointments" label.** Vault grid renders "Appointments" on a single line
  (not wrapped). **VERIFIED FIXED.**
- [x] **H1 — Vault→circle sync (doctor).** Added DrMCPTest / General Physician / MCPClinic
  → "Doctor added successfully" → prod `vault_doctors` shows
  `DrMCPTest / general_physician / MCPClinic` (was 0). Deleted it → `vault_doctors`=[] again.
  **VERIFIED FIXED both directions.**
- [x] **H1 — Vault→circle sync (medication).** Added MedMCPTest / 1 tablet / once daily
  → prod `vault_medications` shows `MedMCPTest / 1 tablet / once_daily`. Deleted → []. 
  **VERIFIED FIXED both directions.**
- [x] **M4 — Delete refresh.** Deleting the doctor and the medication both removed the card
  **immediately in-place** (list went straight to "No doctors yet" / "No medications yet",
  no navigate-away needed, no stale card). **VERIFIED FIXED** (Doctors + Medications).
- [ ] **N1 (NEW, 🟡) — Vault grid item counts don't refresh after add.** After adding
  DrMCPTest and returning to the category grid, the **Doctors card still showed "0 items"**
  even though the doctor was saved, persisted, and synced to prod. Re-entering Doctors showed
  the card present. So data is correct; only the grid's cached count is stale until full reload.
  Same root-cause family as M4 (count read once at grid mount; not refreshed on focus).
  Repro: Vault → Doctors → Add New Doctor → Save → ← Vault. Expected "1 item", got "0 items".
- [~] **sync_changes note.** The QA plan expected `sync_changes` to grow on a vault edit, but
  the table is **globally empty (0 rows)** even though the entity reached `vault_doctors` /
  `vault_medications` directly. The server's `POST /circles/:id/sync` writes the entity table
  but does not populate the `sync_changes` changelog (columns: action/synced_to_device/…, looks
  built for server→device push). Not an H1 failure — caregiver edits DO reach the circle — but
  other members relying on the incremental changelog (vs a full entity pull) wouldn't get deltas.
  Worth a follow-up to confirm cross-device propagation uses the entity tables, not sync_changes.

### 🔴 M1 + M2 REOPENED — consent role-awareness does NOT trigger for a real caregiver (vc9, on-device)

- [ ] **M1/M2 — NOT working on-device (was marked fixed; unit-tested only).** On the caregiver
  device, Settings → Security → Privacy & Consent **still shows the owner/patient experience**:
  - Header reads **"Your Data, Your Control"** (not "Managed by the Care Recipient").
  - Body reads "You decide what information Karuna can access…" (owner framing).
  - The **"Share with Caregivers" toggle is interactive, NOT read-only** — tapping it opens the
    owner-only **"Enable Data Sharing"** dialog (CANCEL/ENABLE). (Cancelled — no consent mutated.)
  - **Root cause (code-confirmed):** `ConsentScreen` derives the audience from
    `onboardingStore.getRole()` (`src/components/ConsentScreen.tsx:57`). `getRole()`
    (`src/services/onboardingStore.ts:75,88`) returns the **local onboarding self-description**
    stored at `@karuna_onboarding_role`, which **defaults to `'self'`** and is only ever set to
    `'caregiver'` inside the onboarding flow (`OnboardingFlow.tsx:70`) when the user taps
    "I'm a caregiver". It has **nothing to do with care-circle membership**. This device's user
    is a caregiver by *circle membership* (server-side, non-owner), but onboarded as / defaulted
    to `'self'`, so `consentAudience('self')` → `canEdit:true` → owner UI.
  - **Runtime proof:** the "Enable Data Sharing" dialog only appears past
    `if (!audience.canEdit) return;` (ConsentScreen.tsx:64), so `canEdit===true`, so
    `getRole()!=='caregiver'` on this device — despite it being a real caregiver account.
  - **Why it matters (HIGH):** (a) privacy miscommunication — a caregiver is told the data is
    *theirs*; (b) the original M1 defect (editable toggles that the server rejects owner-only)
    is **still present** for real caregivers — the fix's `canEdit` guard never engages for them.
  - **Recommended fix:** key consent edit-permission off **care-circle ownership**, not the
    onboarding role. The authority already exists server-side (`PUT /consent` 403s non-owners,
    surfaced via consent.ts sync-error listener). The client should learn "am I the circle owner"
    from the circle membership data (Family/Care Circle fetch: members + roles + this device's
    userId) and pass *that* to `consentAudience()`. The onboarding self/caregiver flag is the
    wrong signal and also mis-handles patient-who-onboarded-as-caregiver. **Needs a new build.**

- [x] **M3 — Sync Health Data feedback.** Health → Quick Actions → "Sync Health Data" → explicit
  alert **"Sync didn't finish — Not connected to health platform"** (OK). No silent no-op; clear
  result message (this device has no health platform connected). **VERIFIED FIXED.**

### vc9 — additional on-device CRUD + cross-checks (closing prior "inferred" gaps)

- [x] **H1 Appointments (now driven on-device).** Added "ApptMCPTest" (Doctor type, 15 Jun 2026,
  10:30 AM) → prod `vault_appointments` (purpose='ApptMCPTest', date 2026-06-14T23:00Z=15 Jun BST,
  time 10:30, status scheduled). Deleted → []. **Synced both directions; M4 refresh OK.**
- [x] **H1 Contacts (now driven on-device).** Added "ContactMCPTest" (Friend, 5551234567) → prod
  `vault_contacts` (name=ContactMCPTest, relationship=friend, phone=5551234567). Deleted → [].
  **Synced both directions; M4 refresh OK.** → **H1 now verified on-device for ALL FOUR
  caregiver-editable entity types: doctors, medications, appointments, contacts.**
- [x] **Log Vital Reading (vc9 re-verify).** Logged heart rate 135 bpm (out-of-range) →
  `health_data` (heart_rate, 135, bpm, manual, 2026-06-01T09:26:00Z) + `caregiver_alerts`
  ("Abnormal heart rate detected", severity high, 09:26:01Z). Recent Vitals card refreshed
  in-place. **Both directions confirmed; abnormal value correctly fires alert.** (test row cleaned up)
- [x] **Vault Accounts (add/edit/delete + sync boundary).** Added "AcctMCPTest" (Bank) → "Account
  added successfully"; Edited (institution → "MCPBank") → "Account updated successfully", card
  refreshed in-place; Deleted → "No accounts yet" (M4 OK). Cross-check: `vault_accounts`=0 the
  whole time → **accounts correctly EXCLUDED from circle sync by design** (financial data stays
  on-device). Good security boundary.
- [~] **Vault Documents** — not driven on-device (file-upload type; excluded from sync by design
  like accounts). Empty state renders.

### Care Circle (Family) tab — vc9

- [x] **Sync Now** → explicit **"Sync Complete — Synced 1 items"** alert; "Last Sync" updated to
  "Just now". Good feedback.
- [x] **Leave Care Circle** → confirmation dialog ("Are you sure you want to leave this care
  circle? Your data will no longer sync with caregivers.") → **CANCELLED** (did NOT leave).
- [ ] **N2 (NEW, 🟡) — "Connection Status: Offline" persists even right after a successful sync.**
  The Care Circle screen shows a red/amber "Offline" dot continuously, including immediately after
  "Sync Complete — Synced 1 items" and while vault writes are actively reaching prod. Almost
  certainly reflects WebSocket/real-time status, not REST reachability — but to a caregiver/elder
  it reads as "not connected / my data isn't going anywhere," which contradicts the successful
  sync. Recommend: label it "Real-time updates: off" or reconcile it with actual sync success.
- [ ] **N3 (NEW, 🟡) — Care Circle copy is owner/patient-framed for a caregiver device.** Same
  root cause as M1/M2 (onboarding role='self'): the screen says "Sync **your** data with **your**
  care circle", "**your** data will no longer sync with caregivers", and "Care Circles allow
  **your** family members to: View **your** medication schedule…". A caregiver member is not the
  patient; this framing is misleading. Fix alongside M1/M2 by sourcing role from circle membership.

### Remaining screen sweep (vc9) — all render correctly

- [x] **Chat — Voice (hold to talk).** Switch to Voice → long-press mic → recording overlay
  ("● 0:12 Listening…", red Stop, Cancel). Cancel stops cleanly. (STT→backend round-trip not
  exercisable headlessly — no real mic audio.) UI verified on vc9.
- [x] **Chat — Clear conversation.** "Clear" → confirm dialog ("Are you sure you want to clear all
  messages?") — CANCELLED (preserved H2 evidence). Confirm-gated.
- [x] **Settings — Check-In Settings.** Proactive Check-Ins (ON), Daily Frequency slider (Max 3/day),
  Check-In Types all ON (Steps/Weather/Medication/Appointments/Wellbeing/Hydration). Renders OK.
- [x] **Settings — What Karuna Knows.** Your Name (Not set/Edit), People Mentioned (none), Things to
  Remember (none), "Nothing remembered yet … stored only on your device." Renders OK.
- [x] **Settings — Reset to Defaults.** Confirm dialog ("This will reset all settings to their
  default values. Continue?") — CANCELLED. Confirm-gated.
- [x] **Settings — Security Settings.** Set Up PIN, Face ID (⚠️ none enrolled), App Lock, Vault Lock,
  Privacy & Consent, Activity Log all render. Top prefs (text size/speech/language/voice/
  accessibility/emergency) render.
- [x] **Vault lock/unlock + Lock confirmation dialog** re-verified on vc9 (PIN 2580).

### Test-data cleanup (prod) — all removed
All on-device test entities deleted via the app (doctor/med/appt/contact/account). The one
direct-DB artifact (manual 135 bpm `health_data` row + its `caregiver_alerts` row) deleted by id.
Final state for circle 9d4d87d7: vault_doctors/medications/appointments/contacts/accounts all = 0.
(Chat `ai_usage_logs` rows from the H2 test are append-only telemetry — left as-is.)

## vc9 verification summary (2026-06-01)
| Item | Result |
|---|---|
| H1 vault→circle sync (doctor/med/appointment/contact, add+delete) | ✅ FIXED — verified both directions, all 4 entity types |
| H2 chat current date | ✅ FIXED — "Today is Monday, June 1, 2026." |
| M3 Sync Health Data feedback | ✅ FIXED — explicit result alert |
| M4 delete refreshes list in-place | ✅ FIXED — all categories |
| L1 "Appointments" label one line | ✅ FIXED |
| **M1 caregiver consent toggles read-only** | ❌ **NOT working** — toggle still editable (root cause: role from onboardingStore='self', not circle membership) |
| **M2 caregiver consent copy reframed** | ❌ **NOT working** — still "Your Data, Your Control" (same root cause) |
| N1 vault grid item counts refresh after add | 🟡 NEW — count stays "0 items" until full reload |
| N2 Care Circle "Offline" after successful sync | 🟡 NEW — confusing status |
| N3 Care Circle owner-framed copy for caregiver | 🟡 NEW — same root cause as M1/M2 |
| Accounts excluded from sync (security boundary) | ✅ confirmed by design |
| Log Vital Reading → health_data + caregiver_alerts | ✅ verified (out-of-range fires alert) |

---

## ✅✅ Re-verification on build 00b809b7 (2026-06-01 ~13:00, versionCode 9, commit 6087b55)

Installed the new preview build (`adb install -r`, lastUpdateTime 12:51) and confirmed it's the
new build via the changed M2 copy. Device = caregiver (server-side `circle_members.role='caregiver'`
for user f21c5ca0; owner is 96077376). All five re-fixes now VERIFIED on-device:

- [x] **M1 — consent toggles read-only for caregiver. NOW FIXED ✅.** Settings → Security →
  Privacy & Consent: the **"Share with Caregivers" global toggle is greyed/disabled** — tapping it
  does **nothing** (no "Enable Data Sharing" dialog, unlike the prior build). Expanded Health
  Information → the category toggles (**Karuna App**, **AI Assistant**) are also greyed and inert.
  Read-only confirmed at both global and category level.
- [x] **M2 — reframed copy. NOW FIXED ✅.** Header reads **"Managed by the Care Recipient"** with
  "Only the person who set up this care circle can change what's shared. These settings are managed
  on their device — you're viewing them here." (was "Your Data, Your Control"). Root-cause fix
  confirmed working: edit-permission now sourced from `careCircleSync.getMyCircleRole()` (`/auth/me`),
  not the onboarding flag.
- [x] **N1 — vault grid count refresh. NOW FIXED ✅.** Doctors "0 items" → added DrMCPTest2 → back
  to grid → card **immediately shows "1 item"**; after delete → back to grid → "0 items". The
  `useFocusEffect` refreshKey works (both increment and decrement).
- [x] **N2 — Care Circle status after sync. NOW FIXED ✅.** Was "Offline / Last Sync 2 hours ago";
  tapped Sync Now → "Sync Complete — Synced 1 items" → **Connection Status flips to "Connected"**
  (green dot), Last Sync "Just now".
- [x] **N3 — caregiver-framed copy. NOW FIXED ✅.** Care Circle now reads "Sync to get the latest
  updates from **this** care circle", "you'll no longer see the information **this person** shares
  with the circle", and "A Care Circle lets you help **the person you care for**. You can: View
  **their** medication schedule / See upcoming appointments / …", plus "Sensitive information like
  bank accounts stays private to **the person you care for**." No more "your data"/"your medication".

Earlier fixes re-confirmed on this build:
- [x] **H1** — added DrMCPTest2/General Physician/MCPClinic2 → prod `vault_doctors` shows it; deleted → `[]`.
- [x] **M4** — delete → list shows "No doctors yet" immediately (in-place).
- [x] **H2** — fresh msg 13:14 → "**Today is Monday, June 1, 2026. The current time is 1:14 PM**, …" (real date+time).
- [x] **M3** — Sync Health Data → "Sync didn't finish — Not connected to health platform" alert.
- [x] **L1** — "Appointments" grid label on one line.

**Cleanup:** test doctor deleted via app; final prod state for circle 9d4d87d7 — doctors/meds/appts/contacts all = 0.
**Net: all previously-failing items (M1, M2, N1, N2, N3) now pass on-device. No regressions in H1/H2/M3/M4/L1.**
