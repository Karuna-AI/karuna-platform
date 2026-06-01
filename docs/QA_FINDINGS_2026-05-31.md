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

- [ ] **H3 — No safe Vault PIN recovery; a forgotten PIN means TOTAL data loss.**
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
- [ ] **M1 — Consent controls shown to non-owner members.** A caregiver sees the
  owner-only consent UI; toggling now surfaces "Only the circle owner can change"
  (silent failure already fixed), but controls should be gated/hidden for non-owners.
- [ ] **M2 — App presents patient/owner framing regardless of account role**
  (a caregiver device sees "your data"/consent as if it's the patient).
- [ ] **M3 — "Sync Health Data" gives no feedback** when there's nothing to pull
  (0 steps) — silent no-op; add a toast/result.

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
- [ ] **L1 — "Appointments" label wraps** to "Appointment​s" on the vault grid card.
  Re-confirmed (still present) on-device 2026-06-01 — NOT yet fixed.

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
