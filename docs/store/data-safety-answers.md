# Google Play Data Safety — Answers

## Section 1: Data collection & sharing

**Does your app collect or share any of the required user data types? → Yes**

### Data collected

| Data type | Collected | Shared | Purpose |
|---|---|---|---|
| Personal info → Name | Yes | Yes (care circle, service providers) | App functionality, account management |
| Personal info → Email address | Yes | Yes (service providers) | App functionality, account management |
| Personal info → Phone number | Yes (emergency contacts user adds) | Yes (care circle) | App functionality |
| Health and fitness → Health info | Yes (Health Connect: heart rate, steps, BP, glucose, weight; manual meds/appointments) | Yes (care circle, service providers) | App functionality |
| Audio → Voice or sound recordings | Yes (real-time transcription, not stored) | Yes (service providers) | App functionality |
| Photos and videos → Photos | Yes (care-circle sharing) | Yes (care circle) | App functionality |
| Contacts | Yes (user-selected) | Yes (care circle) | App functionality |
| Calendar → Calendar events | Yes (reminders) | No | App functionality |
| Location → Approximate location | Yes (city-level, weather lookup only) | Yes (service providers: weather provider) | App functionality |
| Messages → Other in-app messages | Yes (chat messages; memory context such as names/medications) | Yes (service providers: AI providers) | App functionality |
| App activity → App interactions | Yes (feature events) | No | Analytics |
| App info & performance → Crash logs, Diagnostics | Yes | No | Analytics |
| Device or other IDs → Device or other IDs | Yes | Yes (service providers) | App functionality |

"Shared" here means: (a) transmitted to Karuna's backend gateway, which uses OpenAI (with OpenRouter as a fallback AI provider) as a sub-processor for chat/voice AI, and Open-Meteo (or OpenWeatherMap, if configured) as the weather provider for approximate-location weather lookups; (b) user-directed sharing with invite-only care-circle members. No data is sold or shared for advertising.

### Data is collected: → Yes (all rows above)

## Section 2: Security practices

- **Is all user data encrypted in transit? → Yes** (TLS/HTTPS everywhere; cleartext blocked in production builds)
- **Can users ask that their data be deleted? → Yes** — deletion performs a full server-side wipe: the user's owned care circles are cascade-deleted (vault, health, alerts, sync data) and other shared references (AI usage logs, audit logs) are anonymized. The in-app account-deletion path (Settings → Security) is being added for this release; the deletion endpoint is already live and tested server-side.
- Independent security review: No

## Section 3: Health Connect (App content → Health Connect permissions)

Declare each permission with justification:
- **Read:** `READ_HEART_RATE`, `READ_STEPS`, `READ_BLOOD_PRESSURE`, `READ_BLOOD_GLUCOSE`, `READ_BODY_WEIGHT`, `READ_OXYGEN_SATURATION` → "Displayed on the user's wellness dashboard and optionally shared with their invited care circle for caregiver check-ins."
- **Write:** `WRITE_HEART_RATE`, `WRITE_STEPS`, `WRITE_BLOOD_PRESSURE`, `WRITE_BLOOD_GLUCOSE`, `WRITE_BODY_WEIGHT`, `WRITE_OXYGEN_SATURATION` → "Allows the app to write manually entered vitals into Health Connect so the user's health records stay in sync."
- WRITE permissions need a separate Play Console justification and may trigger additional review; if Play flags them, drop the WRITE set and resubmit read-only.
- Google may request a demo video: record ~60s showing the permission prompt → dashboard with data → care-circle sharing toggle.

## Section 4: Permissions declaration (App content → Sensitive permissions)

- **Microphone / RECORD_AUDIO:** core feature — tap-to-talk voice conversations with the AI companion, real-time transcription.
- **Camera / Photos:** optional — sharing photos with the care circle.
- **Contacts:** optional — quickly adding family/caregivers to the care circle.
- **Calendar:** optional — appointment reminders.
- **Location (approximate):** optional — local weather in the chat widget; used only for the weather lookup, never tied to identity.
- Foreground-service / exact-alarm (if prompted): medication reminders.
