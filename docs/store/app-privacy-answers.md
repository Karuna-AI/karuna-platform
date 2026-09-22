# Apple App Privacy — Answers for App Store Connect

Answer key per data type: **Collected? / Purpose / Linked to user? / Tracking?**

Karuna uses no third-party advertising or analytics SDKs. All network calls go to Karuna's own backend gateway (`karuna-gateway-production.up.railway.app`), which uses OpenAI (with OpenRouter as a fallback provider) as a sub-processor for chat and voice transcription, and Open-Meteo (or OpenWeatherMap, if configured) for weather. Telemetry goes to the same first-party gateway only. **Tracking = No** for every data type.

## Health & Fitness → Health
- Collected: **Yes** — Apple HealthKit data (heart rate, steps, blood pressure, blood glucose, body weight) when the user grants permission, plus manually entered medications, appointments, and check-ins.
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## Contact Info → Name, Email Address, Phone Number
- Collected: **Yes** — name and email for account/care-circle identity; phone numbers for emergency contacts the user adds.
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## Contacts
- Collected: **Yes** — device contacts the user chooses to add to their care circle (permission-gated).
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## User Content → Audio Data
- Collected: **Yes** — voice recordings are sent to Karuna's gateway for real-time speech-to-text transcription. Karuna does not store audio; it is transmitted to OpenAI for transcription and retained per OpenAI's data-retention policy.
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## User Content → Photos or Videos
- Collected: **Yes** — photos the user takes or picks to share with their care circle (permission-gated).
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## User Content → Other User Content
- Collected: **Yes** — chat messages, vault notes, reminders, and documents the user creates.
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## Calendars → Calendar Data
- Collected: **Yes** — appointments the user grants access to, used for reminders (permission-gated).
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## Location → Coarse Location
- Collected: **Yes** — approximate (city-level) location, used only to fetch local weather from the weather provider (Open-Meteo; OpenWeatherMap if configured). Not tied to the user's identity.
- Purpose: App Functionality
- Linked to user: No
- Tracking: No

## Identifiers → User ID, Device ID
- Collected: **Yes** — account identifier and device identifier for sessions, push notifications, and security.
- Purpose: App Functionality
- Linked to user: Yes
- Tracking: No

## Usage Data → Product Interaction
- Collected: **Yes** — anonymized reliability events (permission grants/denials, errors, action cancellations) sent to Karuna's own gateway (`/api/telemetry`). The server allowlists only error/permission event types; other event names are rejected. No third-party analytics SDKs (no Sentry).
- Purpose: Analytics
- Linked to user: No
- Tracking: No

## Diagnostics → Crash Data, Performance Data
- Collected: **Yes** — crash and performance diagnostics for stability (JS-level error/performance events sent to Karuna's own gateway; no third-party crash SDKs bundled).
- Purpose: Analytics
- Linked to user: No
- Tracking: No

## Notes for the form
- **Sensitive info:** Health data is collected — Apple flags this; the privacy policy discloses it and HealthKit usage is permission-gated with `NSHealthShareUsageDescription`.
- **"Do you collect data from this app?"** → Yes (answers above).
- If Apple asks about encryption export compliance: `usesNonExemptEncryption = false` is already set in `app.config.js` (standard TLS only) — submit the annual self-classification report exemption as usual; no ERN needed.
