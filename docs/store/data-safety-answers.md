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
| App activity → App interactions | Yes (feature events) | No | Analytics |
| App info & performance → Crash logs, Diagnostics | Yes | No | Analytics |
| Device or other IDs → Device or other IDs | Yes | Yes (service providers) | App functionality |

"Shared" here means: (a) transmitted to Karuna's backend gateway, which uses OpenAI as a sub-processor for chat/voice AI; (b) user-directed sharing with invite-only care-circle members. No data is sold or shared for advertising.

### Data is collected: → Yes (all rows above)

## Section 2: Security practices

- **Is all user data encrypted in transit? → Yes** (TLS/HTTPS everywhere; cleartext blocked in production builds)
- **Can users ask that their data be deleted? → [CONFIRM]** — verify the in-app account-deletion path (Settings → Security) actually wipes server data, then answer Yes. If it doesn't exist yet, add it before the production rollout — both stores increasingly check this.
- Independent security review: No

## Section 3: Health Connect (App content → Health Connect permissions)

Declare each permission with justification:
- `READ_HEART_RATE`, `READ_STEPS`, `READ_BLOOD_PRESSURE`, `READ_BLOOD_GLUCOSE`, `READ_BODY_WEIGHT` → "Displayed on the user's wellness dashboard and optionally shared with their invited care circle for caregiver check-ins."
- Google may request a demo video: record ~60s showing the permission prompt → dashboard with data → care-circle sharing toggle.

## Section 4: Permissions declaration (App content → Sensitive permissions)

- **Microphone / RECORD_AUDIO:** core feature — tap-to-talk voice conversations with the AI companion, real-time transcription.
- **Camera / Photos:** optional — sharing photos with the care circle.
- **Contacts:** optional — quickly adding family/caregivers to the care circle.
- **Calendar:** optional — appointment reminders.
- Foreground-service / exact-alarm (if prompted): medication reminders.
