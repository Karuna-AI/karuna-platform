# Karuna AI Companion — Store Listing Copy

> Privacy policy deployed: https://karuna-privacy-policy.vercel.app/

## Shared

- **App name:** Karuna AI Companion
- **Bundle ID / package:** `in.karunaapp.companion`
- **Version:** 1.0.0 (iOS build 33, Android versionCode 12)
- **Category:** Lifestyle (alt: Medical — pick Lifestyle; Medical triggers extra review scrutiny)
- **Support URL:** https://karunaapp.in
- **Privacy policy URL:** `https://karuna-privacy-policy.vercel.app/`

## Apple App Store

- **Subtitle** (30 chars max): `Voice AI for senior care`
- **Keywords** (100 chars max):
  `elderly,senior,caregiver,voice assistant,medication reminder,companion,health,family,care circle,AI`
- **Description:**
```
Karuna is a voice-first AI companion designed for seniors — and the family members who care for them.

Just tap and talk. Karuna understands natural speech in English, Hindi, Marathi, and Spanish, with large text and simple controls built for older adults.

FOR SENIORS
• Voice-first chat — have real conversations, ask questions, get gentle help with everyday technology
• Medication reminders — never miss a dose, with timely nudges
• Health dashboard — see your wellness at a glance, including data from Apple Health (optional)
• Memory keeper — Karuna remembers the people and things that matter to you

FOR FAMILIES & CAREGIVERS
• Care circle — stay connected with notes, alerts, and activity updates
• Proactive check-ins — get notified if something seems off
• Secure vault — medications, doctors, appointments, and documents in one encrypted place

PRIVACY FIRST
• Your vault is encrypted with AES-256 on your device
• Voice is transcribed in real time and not stored by Karuna — audio is processed by OpenAI per their data-retention policy
• You control exactly what is shared with your care circle

Karuna is a companion, not a medical device. It does not diagnose, treat, or replace professional care. In an emergency, always call your local emergency number.
```
- **What's New (v1.0.0):** `Initial release.`
- **Age rating:** 4+ (no objectionable content)
- **Review notes:** see `review-notes.md`

## Google Play

- **Short description** (80 chars max):
  `Voice-first AI companion for seniors: chat, reminders & family care circle.`
- **Full description:** (same as App Store description above)
- **What's new:** `Initial release.`
- **Category:** Lifestyle
- **Content rating questionnaire:** no violence, no user-generated chat with strangers (care circle is invite-only), no location sharing → expect **Everyone**
- **Target audience:** note the app is designed for seniors but usable by all ages; complete the "Designed for Families" section as **No**
- **Data safety form:** see `data-safety-answers.md`
- **Health Connect declaration:** the app reads heart rate, steps, blood pressure, blood glucose, body weight, and oxygen saturation via Health Connect (READ_*), and can write manually entered vitals back (WRITE_*). Declare each in Play Console → App content → Health Connect permissions, with the in-app justification (wellness dashboard & caregiver updates; syncing manual entries). Google may require a verification video — record a 1-minute screen capture showing the Health dashboard permission prompt and the data displayed. Note: WRITE permissions may need a separate justification; if flagged, resubmit with read-only permissions.
