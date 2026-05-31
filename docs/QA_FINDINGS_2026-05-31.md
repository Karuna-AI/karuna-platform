# Karuna — Full-App QA Walkthrough & Issue Tracker (2026-05-31)

Device: Samsung Galaxy A21s (Android 12), preview build (all fixes), against PROD.
Status legend: [ ] open · [x] fixed/shipped · [~] in progress

## Issues to fix (todos)

### 🔴 HIGH
- [ ] **H1 — Vault data added on device never syncs to the care circle.**
  `careCircleSync.trackChange` has zero callers; `vaultService.add/update/delete*`
  (medications, doctors, appointments, contacts, accounts, documents) write
  locally only. Patient-entered vault data is invisible to caregivers
  (vault sync is pull-only). Verified: QATestMed saved locally, never reached prod.
  Fix: invoke `trackChange(entityType,id,action,data)` from each vault mutation.
- [x] **H2 — Chat could not answer "what day is it?" (emitted a literal
  `[insert current date here]` placeholder).** Root cause: the chat pipeline
  (`useChat.ts`) injected weather/vault/health context into the user turn but
  **never the current date**, and LLMs have no inherent knowledge of "today".
  Observed live on-device 2026-05-31 (weather was correct, date was a placeholder).
  Fix: added `buildDateContext()` and inject `[Today is …, current time …]` every
  turn (`__tests__/hooks/chatDateContext.test.ts`). **Needs next build to verify on-device.**

### 🟠 MEDIUM
- [ ] **M1 — Consent controls shown to non-owner members.** A caregiver sees the
  owner-only consent UI; toggling now surfaces "Only the circle owner can change"
  (silent failure already fixed), but controls should be gated/hidden for non-owners.
- [ ] **M2 — App presents patient/owner framing regardless of account role**
  (a caregiver device sees "your data"/consent as if it's the patient).
- [ ] **M3 — "Sync Health Data" gives no feedback** when there's nothing to pull
  (0 steps) — silent no-op; add a toast/result.

### 🟡 LOW / cosmetic
- [ ] **L1 — "Appointments" label wraps** to "Appointment​s" on the vault grid card.

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
- [ ] Vault — Accounts / Doctors / Documents / Appointments / Contacts (add/edit/delete)
- [ ] Vault — Edit/Delete/Stop a medication
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
