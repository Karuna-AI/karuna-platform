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
- [x] Chat — Type/send round-trip
- [ ] Chat — Clear conversation
- [ ] Chat — Voice (hold to talk)
- [x] Health Dashboard (steps, meds, vitals, Log Vital, Sync Health Data)
- [ ] Health — Medications "View All" / detail
- [x] Vault — create/unlock/lock, category grid
- [x] Vault — Medications add
- [ ] Vault — Accounts / Doctors / Documents / Appointments / Contacts (add/edit/delete)
- [ ] Vault — Edit/Delete/Stop a medication
- [x] Family/Care Circle — Sync
- [ ] Family — Leave Circle (verify dialog only; do NOT leave)
- [x] Settings — top prefs (text size, speech, language, voice, accessibility)
- [ ] Settings — Add Emergency Contact
- [ ] Settings — Security: Set Up PIN, Face ID, App Lock, Vault Lock toggles
- [ ] Settings — Security: Activity Log
- [x] Settings — Privacy & Consent (toggle, category detail)
- [ ] Settings — Check-In Settings (frequency, types)
- [ ] Settings — What Karuna Knows (name, mentions, instructions)
- [ ] Settings — Reset to Defaults
