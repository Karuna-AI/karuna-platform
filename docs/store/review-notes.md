# App Store Review Notes — Karuna AI Companion v1.0.0

## Demo account
**No login is required.** Karuna creates a local profile on first launch — the reviewer does not need any username, password, or invite code to exercise the full app.

## Review path (2–3 minutes)
1. Launch the app → onboarding appears.
2. **Choose a role** — pick "Senior" to see the primary experience.
3. **Language & voice** — pick English, try the voice preview.
4. **Permissions** — grant or skip microphone, speech recognition, and notifications. Everything works if skipped (typed chat is the fallback).
5. **Security setup** — create a 4-digit PIN (e.g. `1234`). This unlocks the app on later launches.
6. **Caregiver invite** — optional; skip to go straight to the Chat screen.
7. **Chat** — tap the microphone and speak, or type. This exercises voice transcription and AI chat end-to-end against our production backend.

## What to try
- **Voice conversation:** tap-to-talk; transcription and spoken replies work in English, Hindi, Marathi, and Spanish.
- **Vault (tab):** add a medication, doctor, or appointment — data is encrypted on-device (AES-256-GCM).
- **Health dashboard:** works without HealthKit; optionally grant Health access in Settings to see live data.
- **Care circle:** generate an invite link from the Care Circle screen and open it on a second device to see cross-device sharing.

## Notes for the reviewer
- All permission prompts (microphone, speech recognition, camera, photos, contacts, calendar, HealthKit) are optional and can be denied or skipped — the app degrades gracefully.
- Karuna is a wellness companion, **not a medical device**: it does not diagnose, treat, or provide emergency services. The app says this in the listing and in-app where relevant.
- Voice recordings are transcribed in real time and are not stored by Karuna — audio is processed by OpenAI per their data-retention policy.
- Contact: admin@karunaapp.in — we can join a review call or provide a TestFlight walkthrough if anything is unclear.
