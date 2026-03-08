# KARUNA 2026 - COMPREHENSIVE TESTING PLAN

**Version:** 1.0
**Date:** March 8, 2026
**App Version:** 1.0.0 (Build 1)
**Platforms:** iOS (TestFlight), Caregiver Portal (Web), Admin Portal (Web)

---

## TABLE OF CONTENTS

1. [Testing Environment Setup](#1-testing-environment-setup)
2. [Mobile App Testing (iOS)](#2-mobile-app-testing-ios)
3. [Caregiver Portal Testing (Web)](#3-caregiver-portal-testing-web)
4. [Admin Portal Testing (Web)](#4-admin-portal-testing-web)
5. [Backend API Testing](#5-backend-api-testing)
6. [Cross-Platform Integration Testing](#6-cross-platform-integration-testing)
7. [Performance & Stress Testing](#7-performance--stress-testing)
8. [Security Testing](#8-security-testing)
9. [Accessibility Testing](#9-accessibility-testing)
10. [Bug Report Template](#10-bug-report-template)

---

## 1. TESTING ENVIRONMENT SETUP

### 1.1 Prerequisites

| Component | URL / Access |
|-----------|-------------|
| **iOS App** | Install via TestFlight (invite from admin@karunaapp.in) |
| **Caregiver Portal** | https://[caregiver-portal-url] |
| **Admin Portal** | https://[admin-portal-url] |
| **Backend API** | https://karuna-api-production.up.railway.app |

### 1.2 Test Accounts to Create

| Account Type | Email | Password | Purpose |
|-------------|-------|----------|---------|
| Admin (Super Admin) | admin@test.karuna.in | TestAdmin123! | Admin portal testing |
| Caregiver (Owner) | caregiver1@test.karuna.in | TestCare123! | Care circle owner |
| Caregiver (Member) | caregiver2@test.karuna.in | TestCare123! | Invited caregiver |
| Caregiver (Viewer) | viewer@test.karuna.in | TestView123! | View-only member |
| Mobile User | (via app onboarding) | PIN: 1234 | Elderly user on mobile |

### 1.3 Test Devices Required

- iPhone (iOS 16+) with TestFlight installed
- Desktop browser (Chrome/Safari/Firefox) for portal testing
- Stable internet connection
- Microphone-equipped device for voice testing

---

## 2. MOBILE APP TESTING (iOS)

### 2.1 Installation & Launch

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-001 | Install from TestFlight | 1. Open TestFlight app 2. Find "Karuna" 3. Tap "Install" | App installs successfully | |
| M-002 | First launch | Open app after install | Onboarding flow starts | |
| M-003 | App icon & splash | Launch app | Shows Karuna icon (indigo), splash screen with logo on #4F46E5 background | |

---

### 2.2 Onboarding Flow (8 Steps)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-010 | Welcome & Role Selection | 1. Launch app first time 2. See welcome screen | Shows role options: "Primary User" and "Caregiver" | |
| M-011 | Select Primary User role | Tap "Primary User" | Proceeds to next step, role saved | |
| M-012 | Select Caregiver role | Tap "Caregiver" | Proceeds to next step, role saved | |
| M-020 | Language & Voice Setup | 1. Arrive at language screen 2. Browse language list | Shows 50+ languages with native names | |
| M-021 | Select English | Tap "English" | English selected, highlighted | |
| M-022 | Select Hindi | Tap "Hindi (हिन्दी)" | Hindi selected, UI updates | |
| M-023 | Select non-Latin language | Select Arabic/Chinese/Japanese | Correct script direction applied (RTL for Arabic) | |
| M-024 | Voice selection | Choose male/female voice | Voice preview plays in selected language | |
| M-025 | Test voice playback | Tap play/test button | TTS speaks sample text in chosen voice | |
| M-030 | Microphone Permission | 1. Arrive at mic permission screen 2. Read explanation | Shows why microphone is needed | |
| M-031 | Grant mic permission | Tap "Allow" when iOS prompt appears | Permission granted, proceed to next step | |
| M-032 | Deny mic permission | Tap "Don't Allow" | App shows fallback message, can continue with text-only | |
| M-040 | Notification Permission | Arrive at notification screen | Shows explanation for notifications | |
| M-041 | Grant notification permission | Tap "Allow" | Permission granted, notifications enabled | |
| M-042 | Deny notification permission | Tap "Don't Allow" | App continues, proactive check-ins won't push | |
| M-050 | Security Setup - Create PIN | 1. Arrive at security screen 2. Enter 4+ digit PIN | PIN entry accepted | |
| M-051 | Confirm PIN | Re-enter same PIN | PIN confirmed and saved | |
| M-052 | PIN mismatch | Enter different PIN for confirmation | Error: "PINs don't match", retry | |
| M-053 | Enable biometric auth | Toggle biometric (Face ID/Touch ID) | iOS biometric prompt appears and enables | |
| M-060 | Quick Setup | 1. Arrive at quick setup 2. See emergency contacts section | Can add emergency contacts and set speech rate | |
| M-061 | Add emergency contact | Enter name and phone number | Contact saved to emergency list | |
| M-062 | Set speech rate | Adjust speech rate slider (0.7 - 1.0) | Preview of speed change | |
| M-070 | Caregiver Invite (optional) | 1. Arrive at invite screen 2. Option to skip | Can generate invite link or skip | |
| M-071 | Generate invite link | Tap "Generate Invite" | Shareable invite link created | |
| M-072 | Skip caregiver invite | Tap "Skip" | Proceeds without inviting | |
| M-080 | Voice Tutorial | Arrive at tutorial screen | Shows how to use voice button | |
| M-081 | Complete tutorial | Follow tutorial steps | Tutorial marked complete | |
| M-090 | Onboarding Complete | Arrive at completion screen | Shows success message, proceed to main app | |
| M-091 | Navigate to chat | Tap "Get Started" or equivalent | Transitions to Chat Screen | |
| M-092 | Onboarding not shown again | Close and reopen app | Goes directly to chat (or lock screen if enabled) | |

---

### 2.3 Chat Screen (Core Feature)

#### 2.3.1 Text Chat

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-100 | Chat screen loads | Complete onboarding or open app | Chat screen visible with input area and voice button | |
| M-101 | Send text message | 1. Tap text input 2. Type "Hello" 3. Tap send | Message appears in chat as user bubble | |
| M-102 | Receive AI response | Send any message | AI response appears within 5-30 seconds as assistant bubble | |
| M-103 | Response is contextual | Ask "What's your name?" | AI introduces itself as Karuna | |
| M-104 | Multiple messages | Send 3-4 messages in sequence | All messages display in order with responses | |
| M-105 | Long message | Send a message with 200+ characters | Message displays correctly, wraps properly | |
| M-106 | Empty message | Try to send empty text | Send button disabled or message not sent | |
| M-107 | Special characters | Send message with emoji, symbols: "Hello! 😊 @#$" | Characters display correctly | |
| M-108 | Loading indicator | Send a message | Loading indicator shows while waiting for response | |
| M-109 | Error handling | Send message with no internet | Error message displayed, option to retry | |
| M-110 | Retry failed message | Tap retry on failed message | Message resent successfully | |
| M-111 | Auto-scroll | Send multiple messages to fill screen | Chat auto-scrolls to latest message | |
| M-112 | Clear messages | Find and use clear chat option | All messages cleared | |

#### 2.3.2 Voice Chat

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-120 | Voice button visible | Open chat screen | Large voice/microphone button prominently displayed | |
| M-121 | Start recording | Press and hold or tap voice button | Recording indicator appears (animation, timer) | |
| M-122 | Recording feedback | While recording | Visual feedback: recording animation, duration timer | |
| M-123 | Haptic on record start | Start recording (if haptics enabled) | Device vibrates briefly | |
| M-124 | Stop recording | Release or tap again | Recording stops, processing begins | |
| M-125 | Transcript appears | After recording stops | Transcribed text appears in editable field | |
| M-126 | Edit transcript | Modify the transcribed text | Text editable before sending | |
| M-127 | Confirm transcript | Tap confirm/send on transcript | Edited text sent as message | |
| M-128 | Dismiss transcript | Tap cancel/dismiss on transcript | Transcript discarded, no message sent | |
| M-129 | Short recording (<1s) | Record very briefly | Handled gracefully (error or minimum message) | |
| M-130 | Long recording (30s+) | Record for 30+ seconds | Recording continues, max duration ~60s | |
| M-131 | Cancel recording | Start recording then cancel | Recording cancelled, no transcript | |
| M-132 | Voice in Hindi | Switch language to Hindi, record in Hindi | Hindi speech transcribed correctly | |
| M-133 | Voice in other language | Switch to any supported language, speak | Transcription in correct language | |
| M-134 | Background noise | Record with ambient noise | Transcription attempts, may show errors gracefully | |

#### 2.3.3 Text-to-Speech (TTS)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-140 | Auto-play response | Ensure TTS enabled, send message | AI response auto-plays via TTS | |
| M-141 | Stop speaking | Tap stop/interrupt while TTS playing | Speech stops immediately | |
| M-142 | TTS disabled | Disable TTS in settings | Responses appear as text only, no audio | |
| M-143 | Speech rate change | Change speech rate to 0.7x | Speech plays slower | |
| M-144 | Speech rate 1.0x | Change speech rate to 1.0x | Speech plays at normal speed | |
| M-145 | TTS in Hindi | Set language to Hindi | Response spoken in Hindi voice | |
| M-146 | TTS in other language | Set language to Spanish/French/etc | Response spoken in that language | |
| M-147 | Long response TTS | Get a long AI response | Full response plays without cutting off | |

---

### 2.4 Intent Detection & Actions

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-200 | Call intent | Say/type "Call my son" | Intent detected, confirmation modal appears | |
| M-201 | Confirm call | Tap "Confirm" on call modal | Phone dialer opens with contact number | |
| M-202 | Cancel call | Tap "Cancel" on call modal | Action cancelled, returns to chat | |
| M-203 | Message intent | Say "Send a message to John" | Message confirmation modal appears | |
| M-204 | WhatsApp intent | Say "Send WhatsApp to Mom" | WhatsApp confirmation appears | |
| M-205 | Reminder intent | Say "Remind me to take medicine at 3 PM" | Reminder confirmation appears with time | |
| M-206 | Ride request intent | Say "Book an Uber to the hospital" | Ride request confirmation with destination | |
| M-207 | Navigation intent | Say "Navigate to Central Park" | Maps app confirmation | |
| M-208 | YouTube intent | Say "Play Bollywood songs on YouTube" | YouTube confirmation with search query | |
| M-209 | Music intent | Say "Play some relaxing music" | Music app confirmation | |
| M-210 | Emergency intent | Say "Emergency!" or "Call 911" | Emergency confirmation with warning | |
| M-211 | OTP help intent | Say "Help me with OTP" | OTP assistant activates with safety warnings | |
| M-212 | Unknown intent | Say "Tell me a joke" | No action modal, AI responds conversationally | |
| M-213 | Contact not found | Say "Call xyz123person" | Graceful handling - "Contact not found" or asks for clarification | |

---

### 2.5 Knowledge Vault

#### 2.5.1 Vault Access & Security

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-300 | Navigate to Vault | Tap Vault icon/button from chat screen | Vault screen loads (locked state) | |
| M-301 | Vault is locked | First access to vault | PIN entry required | |
| M-302 | Unlock with correct PIN | Enter correct PIN (set during onboarding) | Vault unlocks, shows categories | |
| M-303 | Unlock with wrong PIN | Enter incorrect PIN | Error message, vault stays locked | |
| M-304 | Biometric unlock | Use Face ID/Touch ID (if enabled) | Vault unlocks with biometric | |
| M-305 | Vault auto-locks | Navigate away from vault or background app | Vault re-locks automatically | |
| M-306 | Vault categories visible | After unlocking | Shows 6+ categories with item counts | |

#### 2.5.2 Vault - Accounts

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-310 | View accounts section | Tap "Accounts" in vault | Account list displayed (or empty state) | |
| M-311 | Add bank account | Tap Add, fill: Name, Account Number, IFSC, Branch | Account saved and encrypted | |
| M-312 | Add insurance | Tap Add, select type: Insurance, fill details | Insurance entry saved | |
| M-313 | Edit account | Tap existing account, modify details | Changes saved | |
| M-314 | Delete account | Tap delete on account entry | Confirmation prompt, then deleted | |
| M-315 | Sensitive data encrypted | Check stored data | Account numbers encrypted at rest | |

#### 2.5.3 Vault - Medications

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-320 | View medications | Tap "Medications" in vault | Medication list displayed | |
| M-321 | Add medication | Fill: Name "Aspirin", Dosage "100mg", Frequency "Daily", Time "8:00 AM" | Medication saved | |
| M-322 | Add medication with details | Fill all fields: prescribed by, reason, pharmacy, refill date | All details saved | |
| M-323 | Edit medication | Modify dosage or timing | Changes saved | |
| M-324 | Delete medication | Delete a medication entry | Entry removed | |
| M-325 | Multiple timings | Add medication with 3 daily times | All times saved and displayed | |

#### 2.5.4 Vault - Doctors

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-330 | View doctors | Tap "Doctors" in vault | Doctor list displayed | |
| M-331 | Add doctor | Fill: Name, Specialty, Phone, Clinic | Doctor saved | |
| M-332 | Edit doctor | Modify phone number | Changes saved | |
| M-333 | Delete doctor | Delete a doctor entry | Entry removed | |

#### 2.5.5 Vault - Appointments

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-340 | View appointments | Tap "Appointments" in vault | Appointment list displayed | |
| M-341 | Add appointment | Fill: Title, Date, Time, Location, Doctor | Appointment saved | |
| M-342 | Upcoming vs past | View appointments | Upcoming shown first, past may be in different section | |
| M-343 | Edit appointment | Change date or time | Changes saved | |
| M-344 | Delete appointment | Delete an appointment | Entry removed | |

#### 2.5.6 Vault - Documents

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-350 | View documents | Tap "Documents" in vault | Document list displayed | |
| M-351 | Add document | Select type (ID, Medical Record, etc.), add details | Document saved | |
| M-352 | Physical location note | Add "Physical location: bedroom shelf" | Location info saved | |
| M-353 | Delete document | Delete a document entry | Entry removed | |

#### 2.5.7 Vault - Contacts

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-360 | View contacts | Tap "Contacts" in vault | Contact list displayed | |
| M-361 | Add contact | Fill: Name, Relationship, Phone, Email | Contact saved | |
| M-362 | Mark as emergency | Toggle "Emergency Contact" flag | Contact marked as emergency | |
| M-363 | Delete contact | Delete a contact entry | Entry removed | |

#### 2.5.8 Vault AI Integration

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-370 | AI vault query | In chat, ask "What's my doctor's phone number?" | AI searches vault and returns doctor's phone if unlocked | |
| M-371 | AI medication query | Ask "When do I take Aspirin?" | AI returns medication timing from vault | |
| M-372 | Vault locked query | Ask vault question while vault is locked | AI asks user to unlock vault first | |

---

### 2.6 Health Dashboard

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-400 | Navigate to Health | Tap Health Dashboard icon from chat | Health dashboard loads | |
| M-401 | Health data display | With health data synced | Shows steps, heart rate, sleep metrics | |
| M-402 | Empty health state | Without health data | Shows appropriate empty state message | |
| M-403 | Health data sync | With HealthKit/Health Connect configured | Data syncs from device health services | |
| M-404 | Medication link | Tap medication section | Links to vault medications | |

---

### 2.7 Care Circle

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-500 | Navigate to Care Circle | Tap Care Circle icon from chat | Care Circle screen loads | |
| M-501 | View circle members | Open Care Circle | Shows list of caregivers in circle | |
| M-502 | Invite caregiver | Tap Invite, enter email | Invitation link generated | |
| M-503 | Share invite link | Copy/share generated link | Link shareable via device share options | |

---

### 2.8 Settings

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-600 | Navigate to Settings | Tap Settings icon from chat | Settings screen loads with all options | |
| M-601 | Change font size - Small | Select "Small" | App text decreases (base: 12pt) | |
| M-602 | Change font size - Medium | Select "Medium" | App text at normal size (base: 14pt) | |
| M-603 | Change font size - Large | Select "Large" | App text increases (base: 18pt) | |
| M-604 | Change font size - Extra Large | Select "Extra Large" | App text very large (base: 20pt) | |
| M-605 | High contrast mode ON | Toggle high contrast | Colors change to maximum contrast | |
| M-606 | High contrast mode OFF | Toggle high contrast off | Colors return to normal | |
| M-607 | Change speech rate | Adjust slider from 0.7 to 1.0 | TTS speed changes accordingly | |
| M-608 | Change language | Select different language | App language updates (translations, TTS, STT) | |
| M-609 | Enable TTS | Toggle TTS on | AI responses read aloud | |
| M-610 | Disable TTS | Toggle TTS off | AI responses shown as text only | |
| M-611 | Enable haptic feedback | Toggle haptics on | Device vibrates on interactions | |
| M-612 | Disable haptic feedback | Toggle haptics off | No vibrations on interactions | |
| M-613 | Manage emergency contacts | Tap emergency contacts section | Can add/edit/remove emergency contacts | |
| M-614 | Security settings link | Tap "Security" | Navigates to security settings | |
| M-615 | Proactive preferences | Tap "Proactive Check-ins" | Navigates to proactive settings | |
| M-616 | Memory viewer link | Tap "Memory Viewer" | Navigates to memory viewer | |
| M-617 | Settings persist | Change settings, close app, reopen | All settings preserved | |

---

### 2.9 Security & Lock Screen

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-700 | App lock enabled | Enable app lock in security settings | App requires PIN on next open | |
| M-701 | Unlock with PIN | Enter correct PIN on lock screen | App unlocks | |
| M-702 | Wrong PIN attempt | Enter wrong PIN | Error shown, remains locked | |
| M-703 | Biometric unlock | Use Face ID/Touch ID on lock screen | App unlocks | |
| M-704 | Lock on background | Background app with lock enabled | App locks when returning | |
| M-705 | Change PIN | Go to Security Settings > Change PIN | PIN updated after confirming old PIN | |
| M-706 | Audit log view | Navigate to Audit Log | Shows chronological list of actions | |
| M-707 | Consent management | Navigate to Consent screen | Shows data sharing permissions | |

---

### 2.10 Proactive Check-Ins

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-800 | Proactive settings | Navigate to Proactive Settings | Shows categories: medication, hydration, activity, weather | |
| M-801 | Enable category | Toggle a check-in category on | Category enabled for check-ins | |
| M-802 | Disable category | Toggle a category off | Category disabled | |
| M-803 | Quiet hours | Set quiet hours (10 PM - 7 AM) | No check-ins during quiet hours | |
| M-804 | Receive check-in | Wait for trigger condition (e.g., inactivity) | Check-in card/banner appears in chat | |
| M-805 | Respond to check-in | Tap a response option on check-in card | Response recorded, card dismissed | |
| M-806 | Dismiss check-in | Dismiss/close check-in card | Card dismissed | |

---

### 2.11 Memory System

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-900 | Memory extraction | Have a conversation: "My name is Raj, I have a son named Arjun" | Memory extracted (check Memory Viewer) | |
| M-901 | Memory viewer | Navigate to Memory Viewer | Shows extracted memories (preferred name, key people) | |
| M-902 | Memory used in chat | After M-900, ask "What's my name?" | AI responds with "Raj" | |
| M-903 | Edit memory | In Memory Viewer, edit an entry | Memory updated | |
| M-904 | Delete memory | In Memory Viewer, delete an entry | Memory removed | |
| M-905 | Personalization | After multiple chats | AI becomes more personalized over time | |

---

### 2.12 Weather Widget

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-950 | Weather displays | Open chat screen (if weather configured) | Weather widget shows current conditions | |
| M-951 | Weather in chat | Ask "What's the weather?" | AI provides weather information | |

---

### 2.13 Deep Links

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| M-960 | Deep link to chat | Open `karuna://chat` | App opens to chat screen | |
| M-961 | Deep link to vault | Open `karuna://vault/medications` | App opens to vault medications (after PIN) | |
| M-962 | Deep link to health | Open `karuna://health` | App opens to health dashboard | |

---

## 3. CAREGIVER PORTAL TESTING (Web)

### 3.1 Authentication

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-001 | Login page loads | Navigate to portal URL | Login form with email/password fields | |
| CP-002 | Login success | Enter valid caregiver credentials | Redirects to dashboard | |
| CP-003 | Login failure - wrong password | Enter wrong password | Error: "Invalid credentials" or similar | |
| CP-004 | Login failure - invalid email | Enter non-existent email | Error displayed | |
| CP-005 | Register page loads | Click "Register" link | Registration form appears | |
| CP-006 | Register success | Fill: Name, Email, Password (6+ chars), Confirm Password | Account created, auto-logged in | |
| CP-007 | Register - password mismatch | Enter different passwords | Error: "Passwords do not match" | |
| CP-008 | Register - short password | Enter 3-char password | Error: "Password must be at least 6 characters" | |
| CP-009 | Register - duplicate email | Register with existing email | Error from API | |
| CP-010 | Token persistence | Login, refresh page | Stay logged in | |
| CP-011 | Logout | Click logout button | Redirected to login, token cleared | |
| CP-012 | Session expired | Wait for token to expire | Redirected to login on next action | |
| CP-013 | Protected route redirect | Access dashboard URL without login | Redirected to login page | |

---

### 3.2 Care Circle Management

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-100 | Dashboard loads | Login successfully | Shows list of care circles (or empty state) | |
| CP-101 | Empty state | No circles exist | "No care circles" message with create button | |
| CP-102 | Create circle - open modal | Click "Create Care Circle" | Modal with Name and Elderly Person Name fields | |
| CP-103 | Create circle - submit | Fill name "Mom's Care", elderly "Mom", click Create | Circle created, appears in list | |
| CP-104 | Create circle - validation | Submit with empty fields | Validation errors shown | |
| CP-105 | Circle card display | After creating circle | Card shows circle name, elderly name | |
| CP-106 | Navigate to circle | Click on a care circle card | Circle detail page loads | |

---

### 3.3 Circle Detail - Dashboard Tab

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-200 | Dashboard tab loads | Enter circle detail | Dashboard tab active by default | |
| CP-201 | Quick stats cards | View top stats row | Shows: Activity Status, Adherence Rate, Check-in Response, Active Alerts | |
| CP-202 | Activity Status card | View activity card | Shows status icon (green/blue/yellow/red) + last active time | |
| CP-203 | Adherence card | View adherence card | Shows percentage, color-coded (green >= 90%, yellow >= 70%, red < 70%) | |
| CP-204 | Check-in card | View check-in card | Shows response rate percentage | |
| CP-205 | Alerts card | View alerts card | Shows count or "None", colored appropriately | |
| CP-206 | Health vitals | View health section | Shows latest readings: heart rate, BP, steps, weight, etc. | |
| CP-207 | Health empty state | No health data synced | Shows "No health data available" with icon | |
| CP-208 | Medication adherence detail | View adherence section | Shows percentage, progress bar, taken/missed/skipped/pending counts | |
| CP-209 | Missed medication warning | When medications are missed | Red alert: "X medication(s) missed today" | |
| CP-210 | Activity monitor | View activity section | Shows status indicator, last activity, check-in rate | |
| CP-211 | Inactivity warning | When concerning inactivity | Yellow warning about extended inactivity | |
| CP-212 | Inactivity alert | When alerting inactivity (8+ hours) | Red alert suggesting to check in | |
| CP-213 | Alerts panel - no alerts | When no active alerts | Checkmark icon + "No active alerts" + "Everything looks good!" | |
| CP-214 | Alerts panel - with alerts | When alerts exist | Color-coded alerts by severity with emoji icons | |
| CP-215 | Acknowledge alert | Click "Acknowledge" on active alert | Status changes to "Acknowledged by [your name]" | |
| CP-216 | Dismiss alert | Click "Dismiss" on active alert | Alert dismissed | |
| CP-217 | Last updated timestamp | View bottom of dashboard | Shows when data was last refreshed | |
| CP-218 | Refresh data | Dashboard auto-refreshes | Data updates via WebSocket or polling | |

---

### 3.4 Real-Time Updates (WebSocket)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-300 | WebSocket connects | Open circle detail | "Live updates" indicator visible | |
| CP-301 | Real-time health update | Mobile user syncs health data | Dashboard updates without manual refresh | |
| CP-302 | Real-time alert | Alert triggered (e.g., missed medication) | New alert appears in alerts panel | |
| CP-303 | Real-time activity update | Mobile user uses app | Activity status updates | |
| CP-304 | WebSocket reconnection | Disconnect internet briefly, reconnect | WebSocket reconnects with backoff | |
| CP-305 | Polling fallback | WebSocket unavailable | Polling occurs every 30 seconds | |

---

### 3.5 Circle Detail - Members Tab

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-400 | View members | Click "Members" tab | Table with all circle members | |
| CP-401 | Member columns | View table | Shows: Name, Email, Role (badge), Joined Date, Actions | |
| CP-402 | Role badges | View role column | Owner=blue, Caregiver=green, Viewer=gray | |
| CP-403 | Invite button visible (owner) | Logged in as circle owner | "+ Invite Member" button visible | |
| CP-404 | Invite button hidden (viewer) | Logged in as viewer | Invite button not shown | |
| CP-405 | Open invite modal | Click "+ Invite Member" | Modal with Email and Role fields | |
| CP-406 | Send invitation | Fill email, select "Caregiver" role, click Send | "Invitation sent to [email]" success message | |
| CP-407 | Invite validation | Submit with empty email | Validation error | |
| CP-408 | Remove member button | As owner, view member row | Remove button visible (not for self or owner) | |
| CP-409 | Remove member | Click Remove, confirm dialog | Member removed from table | |
| CP-410 | Cannot remove self | View own row | No remove button | |
| CP-411 | Cannot remove owner | View owner row | No remove button | |

---

### 3.6 Circle Detail - Vault Tab

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-500 | Vault accessible (owner/caregiver) | Click Vault tab as owner | Vault data sections displayed | |
| CP-501 | Vault blocked (viewer) | Click Vault tab as viewer | "Access Restricted" message | |
| CP-502 | Medications table | View medications section | Table: Name, Dosage, Frequency, Timing | |
| CP-503 | Medications empty | No medications | "No medications recorded" | |
| CP-504 | Doctors cards | View doctors section | Cards: Name, Specialty, Hospital, Phone, Email | |
| CP-505 | Doctors empty | No doctors | "No doctors recorded" | |
| CP-506 | Appointments table | View appointments section | Table: Date, Time, Doctor, Purpose, Location (scheduled only) | |
| CP-507 | Appointments empty | No appointments | "No upcoming appointments" | |
| CP-508 | Emergency contacts | View contacts section | Cards: Name, Relationship, Phone (emergency only) | |
| CP-509 | Contacts empty | No emergency contacts | "No emergency contacts recorded" | |
| CP-510 | Accounts visible (with permission) | As owner/caregiver with canViewSensitive | Accounts section visible | |
| CP-511 | Account numbers masked | View account numbers | Displayed as "••••" + last 4 digits | |
| CP-512 | Accounts hidden (viewer) | As viewer without canViewSensitive | Accounts section not shown | |

---

### 3.7 Circle Detail - Notes Tab

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-600 | View notes | Click Notes tab | Notes listed, most recent first | |
| CP-601 | Notes color-coded | View note cards | Medical=red border, Financial=yellow, Other=blue | |
| CP-602 | Add note button (caregiver) | As caregiver/owner | "+ Add Note" button visible | |
| CP-603 | Add note button hidden (viewer) | As viewer | Add button not shown | |
| CP-604 | Open add note modal | Click "+ Add Note" | Modal: Title, Category dropdown, Content textarea | |
| CP-605 | Add note - all fields | Fill title "Follow-up needed", category "Medical", content | Note added to list | |
| CP-606 | Category options | Open category dropdown | Options: general, medical, financial, personal, reminder | |
| CP-607 | Notes empty state | No notes exist | "No notes yet" message | |
| CP-608 | Note displays author | View note card | Shows author name and date | |

---

### 3.8 Circle Detail - Overview Tab

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-700 | Overview stats | Click Overview tab | Shows: Members count, Medications count, Upcoming Appointments count | |
| CP-701 | Counts accurate | Compare with Vault/Members tabs | Numbers match actual data | |

---

### 3.9 Invitation Flow

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| CP-800 | Accept invite - logged in | Open invite link while logged in | Invitation accepted, redirect to circle | |
| CP-801 | Accept invite - not logged in | Open invite link while logged out | Auth prompt shown with login/register links | |
| CP-802 | Accept invite - login then accept | Click login from invite page, login, return | Invitation accepted | |
| CP-803 | Invalid invite token | Open invite with wrong token | Error: "Invalid or expired invitation" | |
| CP-804 | Expired invite | Open invite after 72 hours | Error: "Invitation expired" | |
| CP-805 | Already accepted | Open same invite link twice | Appropriate message shown | |

---

## 4. ADMIN PORTAL TESTING (Web)

### 4.1 Authentication

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-001 | Login page loads | Navigate to admin portal URL | Login form with email/password fields | |
| AP-002 | Login success | Enter valid admin credentials | Redirects to admin dashboard | |
| AP-003 | Login failure | Enter wrong credentials | Error message displayed | |
| AP-004 | Token persistence | Login, refresh page | Stay logged in | |
| AP-005 | Logout | Click logout | Redirected to login | |
| AP-006 | Session timeout warning | Stay idle for 13 minutes | Warning modal: "Your session is about to expire" with countdown | |
| AP-007 | Stay logged in | Click "Stay Logged In" on timeout modal | Timer resets, continue working | |
| AP-008 | Auto-logout on timeout | Let countdown reach zero | Automatically logged out | |
| AP-009 | Logout from timeout modal | Click "Logout" on timeout modal | Immediately logged out | |

---

### 4.2 Dashboard

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-100 | Dashboard loads | Login, land on dashboard | Shows metric cards and quick action buttons | |
| AP-101 | Total Users metric | View dashboard | Shows total user count + "new this month" | |
| AP-102 | Active Users metric | View dashboard | Shows active users + "active this week" | |
| AP-103 | Care Circles metric | View dashboard | Shows total circles + average members | |
| AP-104 | Active Alerts metric | View dashboard | Shows active count + critical count | |
| AP-105 | Activity stats | View dashboard | Shows last 24h activity count + active circles | |
| AP-106 | Refresh metrics | Click refresh button | Metrics reload with spinner | |
| AP-107 | Quick action - Users | Click "Manage Users" | Navigates to /users | |
| AP-108 | Quick action - Circles | Click "View Circles" | Navigates to /circles | |
| AP-109 | Quick action - Flags | Click "Feature Flags" | Navigates to /feature-flags | |
| AP-110 | Quick action - Logs | Click "Audit Logs" | Navigates to /audit-logs | |

---

### 4.3 User Management

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-200 | Users page loads | Click "Users" in sidebar | User table loads with pagination | |
| AP-201 | Search by name | Enter name in search, click Search | Results filtered by name | |
| AP-202 | Search by email | Enter email in search, click Search | Results filtered by email | |
| AP-203 | Filter by status - Active | Select "Active" from dropdown | Only active users shown | |
| AP-204 | Filter by status - Suspended | Select "Suspended" from dropdown | Only suspended users shown | |
| AP-205 | Pagination | Click "Next" | Shows next page of results | |
| AP-206 | Pagination info | View bottom | Shows "Showing X to Y of Z" | |
| AP-207 | User columns | View table | Shows: Name, Email, Circles, Status, Last Login, Joined, Action | |
| AP-208 | Status badge - Active | Active user row | Green "Active" badge | |
| AP-209 | Status badge - Suspended | Suspended user row | Red "Suspended" badge | |
| AP-210 | View user detail | Click "View" button | Navigates to user detail page | |

---

### 4.4 User Detail & Actions

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-300 | User detail loads | Click View on a user | Shows profile, circles, actions | |
| AP-301 | User profile display | View profile section | Avatar (initial), name, email, status, phone, login count, dates | |
| AP-302 | User circles list | View circles section | Table of circles user belongs to with roles | |
| AP-303 | Suspend user | Click Suspend > enter reason > confirm | User status changes to Suspended | |
| AP-304 | Suspend reason required | Click Suspend, submit without reason | Validation error | |
| AP-305 | Unsuspend user | View suspended user > Click Unsuspend | User status changes back to Active | |
| AP-306 | Reset password | Click Reset Password > enter new password (6+ chars) | Success message shown | |
| AP-307 | Reset password - short | Enter password < 6 chars | Validation error | |
| AP-308 | Navigate to user's circle | Click View on circle in user detail | Navigates to circle detail | |

---

### 4.5 Care Circle Management (Admin)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-400 | Circles page loads | Click "Care Circles" in sidebar | Circle table with search + pagination | |
| AP-401 | Search circles | Search by circle name or recipient name | Results filtered | |
| AP-402 | Circle columns | View table | Name, Recipient, Owner, Members, Status, Created, View | |
| AP-403 | View circle detail | Click View | Shows circle info, stats, members | |
| AP-404 | Circle stats cards | View detail page | Shows: Members, Medications, Appointments, Active Alerts, Notes, Health Records | |
| AP-405 | Circle members table | View members section | Name, Email, Role (badge), Status, View User button | |
| AP-406 | Navigate to member user | Click "View User" | Goes to /users/{user_id} | |

---

### 4.6 Health Alerts Dashboard (Admin)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-500 | Health alerts page loads | Click "Health Alerts" in sidebar | Overview tab loads | |
| AP-501 | Overview stats | View stat cards | Active Alerts, Today's Alerts, Acknowledged, Total | |
| AP-502 | Alerts by severity table | View overview | Table: Severity, Active, Total with color badges | |
| AP-503 | Alerts by type table | View overview | Table showing alert type distribution | |
| AP-504 | Critical alerts highlighted | View critical alerts card | List of critical/high priority alerts | |
| AP-505 | Circles with most alerts | View table | Sorted by most active alerts | |
| AP-506 | Switch to All Alerts tab | Click "All Alerts" tab | Shows filterable alert table | |
| AP-507 | Filter by status | Select "Active" from status dropdown | Only active alerts shown | |
| AP-508 | Filter by severity | Select "Critical" from severity dropdown | Only critical alerts shown | |
| AP-509 | Alert table columns | View table | Time, Severity, Status, Title, Recipient, Circle | |

---

### 4.7 Medication Reports

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-600 | Medications page loads | Click "Medications" in sidebar | Overview tab with stats | |
| AP-601 | Time range selector | Change from "7 days" to "30 days" | Data refreshes for new range | |
| AP-602 | Overview stats | View stat cards | Adherence %, Total Doses, Missed, Active Medications | |
| AP-603 | Adherence by recipient | View table | Table sorted by lowest adherence first | |
| AP-604 | Common medications | View table | Shows most used medications with adherence % | |
| AP-605 | Trends tab | Click "Trends" tab | Daily adherence trend table | |
| AP-606 | Hourly pattern | View hourly grid | Shows doses by hour with miss rate color coding | |
| AP-607 | High miss rate hours | Hours with >30% miss rate | Highlighted in red | |
| AP-608 | Missed doses tab | Click "Missed Doses" tab | Table of recent missed doses | |

---

### 4.8 AI Usage Analytics

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-700 | AI usage page loads | Click "AI Usage" in sidebar | Overview tab with stats | |
| AP-701 | Overview stats | View stat cards | Total Requests, Total Tokens, Total Cost, Avg Latency | |
| AP-702 | Usage by model | View model table | Model name, Requests, Tokens, Cost, Latency | |
| AP-703 | Usage by type | View type table | Chat/STT/TTS with badges, metrics per type | |
| AP-704 | Daily usage trend | View daily table | Date, Requests, Tokens, Cost | |
| AP-705 | Time range change | Switch from 7 to 30 days | Data refreshes | |
| AP-706 | Request logs tab | Click "Request Logs" | Table of recent API calls | |
| AP-707 | Log details | View log row | Time, Type, Model, Tokens, Cost, Latency, Status | |
| AP-708 | Success/failure badges | View status column | Green "Success" or Red "Failed" badges | |

---

### 4.9 Feature Flags

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-800 | Feature flags page loads | Click "Feature Flags" in sidebar | Table of all feature flags | |
| AP-801 | Flag columns | View table | Name, Description, Enabled toggle, For All toggle, Rollout % | |
| AP-802 | Toggle flag enabled | Click toggle for a flag | Flag status changes (on/off) | |
| AP-803 | Toggle "for all" | Click "For All" toggle (flag must be enabled) | Flag applies to all users | |
| AP-804 | "For All" disabled when flag off | Disable a flag | "For All" toggle becomes disabled | |
| AP-805 | Create new flag | Click "+ Create Flag", fill name and description | New flag appears in table | |
| AP-806 | Permission check | Login as support role | Toggle buttons disabled, create button hidden | |

---

### 4.10 Audit Logs

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-900 | Audit logs page loads | Click "Audit Logs" in sidebar | User Activity tab shown | |
| AP-901 | User activity tab | View default tab | Table: Timestamp, Action (badge), Category, Description | |
| AP-902 | Admin actions tab | Click "Admin Actions" tab | Table: Timestamp, Admin Email, Action, Resource, IP Address | |
| AP-903 | Pagination | Click Next page | Shows more logs | |
| AP-904 | Refresh button | Click refresh | Logs reload | |

---

### 4.11 Settings

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-1000 | Settings page loads | Click "Settings" in sidebar | Settings grouped by category | |
| AP-1001 | View setting categories | Scroll through page | Grouped cards with setting tables | |
| AP-1002 | Edit setting | Click Edit button on a setting | Modal with key (read-only) and value (editable) | |
| AP-1003 | Save string setting | Edit a text value, click Save | Setting updated | |
| AP-1004 | Save JSON setting | Edit a JSON value (object/array), click Save | Setting updated with parsed JSON | |
| AP-1005 | Permission check | Login as non-canManageSettings role | Warning banner, edit buttons hidden | |

---

### 4.12 Navigation & Layout

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| AP-1100 | Sidebar navigation | View sidebar | All 9 menu items with icons | |
| AP-1101 | Active nav item | Navigate to a page | Current page highlighted in sidebar | |
| AP-1102 | Admin info display | View sidebar bottom | Shows admin name and role | |
| AP-1103 | All routes work | Click each sidebar item | Each page loads without errors | |

---

## 5. BACKEND API TESTING

### 5.1 Health & Infrastructure

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| API-001 | Health check | GET /health | 200: `{"status":"healthy","timestamp":"..."}` | |
| API-002 | Metrics endpoint | GET /metrics | 200: JSON with request/latency metrics | |
| API-003 | Feature flags (public) | GET /api/feature-flags | 200: List of enabled feature flags | |

### 5.2 AI Gateway

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| API-100 | Chat request | POST /api/chat with valid messages array | 200: AI response message | |
| API-101 | Chat - empty messages | POST /api/chat with empty array | 400: Validation error | |
| API-102 | Chat - too many messages | POST /api/chat with 51+ messages | 400: "Too many messages" | |
| API-103 | Chat - long message | POST /api/chat with 10001+ char message | 400: "Message too long" | |
| API-104 | Chat - prompt injection | POST /api/chat with "ignore previous instructions" | 400: Blocked by safety filter | |
| API-105 | Chat rate limit | Send 21+ requests in 1 minute | 429: Rate limit error | |
| API-106 | STT request | POST /api/stt with audio file + language | 200: Transcribed text | |
| API-107 | STT - no file | POST /api/stt without audio | 400: "No audio file provided" | |
| API-108 | STT - too large | POST /api/stt with >25MB file | 400: File too large error | |
| API-109 | STT rate limit | Send 11+ STT requests in 1 minute | 429: Rate limit error | |
| API-110 | Telemetry | POST /api/telemetry with allowed event | 200: Success | |
| API-111 | Telemetry - invalid event | POST /api/telemetry with unknown event | 400: "Invalid event type" | |

### 5.3 Auth Endpoints

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| API-200 | User register | POST /api/care/auth/register | 201: User + token | |
| API-201 | User register - duplicate | Register same email twice | 400/409: Error | |
| API-202 | User login | POST /api/care/auth/login | 200: User + token | |
| API-203 | User login - wrong password | Login with wrong password | 401: "Invalid credentials" | |
| API-204 | User profile | GET /api/care/auth/me with Bearer token | 200: User profile | |
| API-205 | User profile - no token | GET /api/care/auth/me without auth | 401: Unauthorized | |
| API-206 | Admin login | POST /api/admin/auth/login | 200: Admin + token | |
| API-207 | Admin profile | GET /api/admin/auth/me | 200: Admin profile with permissions | |
| API-208 | Register rate limit | 4+ registrations in 1 hour from same IP | 429: Rate limit | |
| API-209 | Login rate limit | 6+ login attempts in 1 minute | 429: Rate limit | |

### 5.4 Care Circle CRUD

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| API-300 | Create circle | POST /api/care/circles | 201: Circle created | |
| API-301 | List circles | GET /api/care/circles | 200: Array of user's circles | |
| API-302 | Get circle detail | GET /api/care/circles/:id | 200: Circle with members + permissions | |
| API-303 | Update circle | PUT /api/care/circles/:id | 200: Updated circle | |
| API-304 | Delete circle | DELETE /api/care/circles/:id (owner only) | 200: Deleted | |
| API-305 | Delete circle - not owner | DELETE as caregiver | 403: Forbidden | |

### 5.5 Invitations

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| API-400 | Create invitation | POST /api/care/circles/:id/invite | 201: Invitation with token | |
| API-401 | Get invitation info | GET /api/care/invitations/:token | 200: Invitation details (public) | |
| API-402 | Accept invitation | POST /api/care/invitations/:token/accept | 200: Circle joined | |
| API-403 | Invalid token | GET /api/care/invitations/invalid-token | 404: Not found | |
| API-404 | Expired invitation | Accept after 72 hours | 400: Expired | |

### 5.6 Vault CRUD (Medications, Doctors, Appointments, Contacts, Accounts, Documents)

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| API-500 | Create medication | POST /api/care/circles/:id/vault/medications | 201: Created | |
| API-501 | Update medication | PUT /api/care/circles/:id/vault/medications/:mid | 200: Updated | |
| API-502 | Delete medication | DELETE /api/care/circles/:id/vault/medications/:mid | 200: Deleted | |
| API-503 | Create doctor | POST /api/care/circles/:id/vault/doctors | 201: Created | |
| API-504 | Create appointment | POST /api/care/circles/:id/vault/appointments | 201: Created | |
| API-505 | Create contact | POST /api/care/circles/:id/vault/contacts | 201: Created | |
| API-506 | Create account | POST /api/care/circles/:id/vault/accounts | 201: Created | |
| API-507 | Create document | POST /api/care/circles/:id/vault/documents | 201: Created | |
| API-508 | Sync all vault data | GET /api/care/circles/:id/sync | 200: All vault categories | |
| API-509 | Push sync changes | POST /api/care/circles/:id/sync | 200: Changes synced | |

### 5.7 Monitoring Endpoints

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| API-600 | Log activity | POST /api/care/circles/:id/activity | 201: Activity logged | |
| API-601 | Get activity | GET /api/care/circles/:id/activity | 200: Activity logs with status | |
| API-602 | Get alerts | GET /api/care/circles/:id/alerts | 200: Alerts with severity counts | |
| API-603 | Acknowledge alert | POST /api/care/circles/:id/alerts/:aid/acknowledge | 200: Alert acknowledged | |
| API-604 | Dismiss alert | POST /api/care/circles/:id/alerts/:aid/dismiss | 200: Alert dismissed | |
| API-605 | Log check-in | POST /api/care/circles/:id/checkins | 201: Check-in logged | |
| API-606 | Get check-ins | GET /api/care/circles/:id/checkins | 200: Check-in logs | |
| API-607 | Sync adherence | POST /api/care/circles/:id/adherence | 200: Adherence synced | |
| API-608 | Get adherence | GET /api/care/circles/:id/adherence | 200: Adherence stats | |
| API-609 | Get dashboard | GET /api/care/circles/:id/dashboard | 200: Full dashboard data | |

---

## 6. CROSS-PLATFORM INTEGRATION TESTING

These tests verify the full flow across mobile app, caregiver portal, and admin portal working together.

### 6.1 End-to-End User Journey

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| E2E-001 | Full onboarding to chat | 1. Install iOS app from TestFlight 2. Complete onboarding 3. Send first voice message 4. Receive AI response with TTS | Full journey works seamlessly | |
| E2E-002 | Vault sync to caregiver | 1. Mobile: Add medication to vault 2. Caregiver portal: Check vault tab | Medication appears on caregiver portal | |
| E2E-003 | Care circle invitation flow | 1. Caregiver portal: Create circle 2. Send invitation 3. Second user: Accept invitation 4. Both see same circle | Circle shared between users | |
| E2E-004 | Medication adherence alert | 1. Mobile: Set medication schedule 2. Miss scheduled time 3. System: Generates alert 4. Caregiver portal: Alert appears | Alert visible to caregiver in real-time | |
| E2E-005 | Activity monitoring | 1. Mobile: Use app actively 2. Caregiver portal: Check activity status | Status shows "Active" or "Normal" | |
| E2E-006 | Inactivity detection | 1. Mobile user stops using app 2. Wait for inactivity threshold 3. Caregiver portal: Check activity | Status changes to "Concerning" or "Alert" | |
| E2E-007 | Admin views user data | 1. Users register on caregiver portal 2. Admin portal: Check Users page | New users appear in admin user list | |
| E2E-008 | Admin suspends user | 1. Admin portal: Suspend a user 2. Caregiver portal: User tries to login | Suspended user cannot login | |
| E2E-009 | Feature flag effect | 1. Admin portal: Disable "voice_conversations" flag 2. Mobile app: Check voice feature | Feature disabled (behavior depends on implementation) | |
| E2E-010 | Health data flow | 1. Mobile: Sync health data 2. Caregiver portal: View health vitals 3. Admin portal: View health alerts | Health data flows through all platforms | |
| E2E-011 | Care notes collaboration | 1. Caregiver A: Add note "Follow up needed" 2. Caregiver B: View notes | Note visible to all caregivers | |
| E2E-012 | Check-in response flow | 1. Mobile: Receive proactive check-in 2. Mobile: Respond to check-in 3. Caregiver portal: Check response rate | Response recorded and visible | |
| E2E-013 | Multi-language flow | 1. Mobile: Set language to Hindi 2. Speak in Hindi 3. AI responds in Hindi | Full voice pipeline works in Hindi | |

---

## 7. PERFORMANCE & STRESS TESTING

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| PERF-001 | App cold start time | Kill app, open fresh | App loads within 3-5 seconds | |
| PERF-002 | Chat response time | Send text message | AI response within 5-15 seconds | |
| PERF-003 | STT processing time | Record 10s audio | Transcription within 5-10 seconds | |
| PERF-004 | TTS playback start | Send message with TTS enabled | TTS begins within 1-2 seconds of response | |
| PERF-005 | Vault unlock time | Enter PIN to unlock vault | Vault decrypts and loads within 1-2 seconds | |
| PERF-006 | Portal page load time | Navigate to any portal page | Page loads within 2-3 seconds | |
| PERF-007 | WebSocket latency | Trigger event on mobile | Caregiver portal updates within 2-5 seconds | |
| PERF-008 | Large chat history | Have 100+ messages in chat | Scrolling remains smooth | |
| PERF-009 | Multiple vault items | Add 20+ medications, 10+ contacts, etc. | Vault loads and scrolls smoothly | |
| PERF-010 | Concurrent portal users | 3+ users on caregiver portal for same circle | All see real-time updates | |

---

## 8. SECURITY TESTING

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| SEC-001 | PIN brute force | Enter wrong PIN 5+ times | Account not compromised (ideally lockout after N attempts) | |
| SEC-002 | Vault data at rest | Inspect stored data (AsyncStorage) | Sensitive fields encrypted (AES-256) | |
| SEC-003 | API without auth | Call protected API without token | 401 Unauthorized | |
| SEC-004 | Cross-circle access | Try to access another user's circle via API | 403 Forbidden | |
| SEC-005 | JWT expiry | Use expired token | 401 Unauthorized, redirect to login | |
| SEC-006 | XSS in chat | Send message with `<script>alert(1)</script>` | Script not executed, displayed as text | |
| SEC-007 | XSS in notes | Add note with HTML/script tags | Tags escaped, displayed as text | |
| SEC-008 | SQL injection in search | Search with `'; DROP TABLE users;--` | No database error, handled safely | |
| SEC-009 | Rate limiting works | Exceed rate limit on API | 429 response after limit reached | |
| SEC-010 | Prompt injection | Send "Ignore all previous instructions" | Blocked by server-side filter | |
| SEC-011 | Admin API isolation | Try admin endpoints with user token | 401/403 - separate auth system | |
| SEC-012 | Sensitive data in logs | Check server logs | No PII (passwords, tokens, vault data) in logs | |
| SEC-013 | CORS enforcement | Make API call from unauthorized origin | CORS error / blocked | |
| SEC-014 | Password hashing | Check database directly | Passwords stored as bcrypt hashes, not plaintext | |
| SEC-015 | Invitation token security | Try to guess invitation tokens | Tokens are UUID/random, not guessable | |

---

## 9. ACCESSIBILITY TESTING

| # | Test Case | Steps | Expected Result | Pass/Fail |
|---|-----------|-------|-----------------|-----------|
| A11Y-001 | Screen reader (iOS) | Enable VoiceOver, navigate app | All buttons/inputs have accessibility labels | |
| A11Y-002 | Large text mode | Set font size to Extra Large | All text readable, no truncation | |
| A11Y-003 | High contrast mode | Enable high contrast | Text and UI elements clearly visible | |
| A11Y-004 | Touch targets | Tap all buttons | All buttons at least 48x48dp | |
| A11Y-005 | Voice-first usability | Use app only with voice (no typing) | Core features accessible via voice | |
| A11Y-006 | RTL layout | Set language to Arabic or Hebrew | UI mirrors correctly for RTL | |
| A11Y-007 | Color-blind friendly | Check alerts/status colors | Status conveyed by icon/text, not just color | |
| A11Y-008 | Keyboard navigation (web) | Navigate caregiver portal with keyboard | All interactive elements focusable and usable | |

---

## 10. BUG REPORT TEMPLATE

When reporting bugs, use this format:

```
BUG REPORT
===========

Test Case ID: [e.g., M-121]
Component: [Mobile App / Caregiver Portal / Admin Portal / API]
Severity: [Critical / High / Medium / Low]
Priority: [P0 / P1 / P2 / P3]

Summary:
[One-line description of the bug]

Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected Result:
[What should happen]

Actual Result:
[What actually happened]

Environment:
- Device: [iPhone 15 Pro / Chrome on Windows / etc.]
- OS Version: [iOS 18.2 / Windows 11 / etc.]
- App Version: [1.0.0 Build 1]
- Network: [WiFi / 4G / etc.]

Screenshots/Videos:
[Attach if available]

Additional Notes:
[Any other relevant information]
```

### Severity Definitions

| Severity | Definition | Example |
|----------|-----------|---------|
| **Critical** | App crash, data loss, security vulnerability | App crashes on launch, vault data lost |
| **High** | Major feature broken, no workaround | Voice recording doesn't work, can't login |
| **Medium** | Feature partially broken, workaround exists | TTS doesn't play in Hindi but works in English |
| **Low** | Minor UI issue, cosmetic problem | Text slightly misaligned, color slightly off |

### Priority Definitions

| Priority | Definition |
|----------|-----------|
| **P0** | Fix immediately, blocks release |
| **P1** | Fix before next release |
| **P2** | Fix in upcoming sprint |
| **P3** | Fix when time permits |

---

## TESTING SUMMARY CHECKLIST

| Section | Total Tests | Passed | Failed | Blocked |
|---------|-----------|--------|--------|---------|
| Mobile - Onboarding | 23 | | | |
| Mobile - Chat (Text) | 12 | | | |
| Mobile - Chat (Voice) | 15 | | | |
| Mobile - TTS | 8 | | | |
| Mobile - Intent Actions | 14 | | | |
| Mobile - Vault | 28 | | | |
| Mobile - Health | 5 | | | |
| Mobile - Care Circle | 4 | | | |
| Mobile - Settings | 18 | | | |
| Mobile - Security | 8 | | | |
| Mobile - Proactive | 7 | | | |
| Mobile - Memory | 6 | | | |
| Mobile - Other | 5 | | | |
| Caregiver Portal - Auth | 13 | | | |
| Caregiver Portal - Circles | 7 | | | |
| Caregiver Portal - Dashboard | 19 | | | |
| Caregiver Portal - Real-time | 6 | | | |
| Caregiver Portal - Members | 12 | | | |
| Caregiver Portal - Vault | 13 | | | |
| Caregiver Portal - Notes | 9 | | | |
| Caregiver Portal - Overview | 3 | | | |
| Caregiver Portal - Invitations | 6 | | | |
| Admin Portal - Auth | 9 | | | |
| Admin Portal - Dashboard | 11 | | | |
| Admin Portal - Users | 11 | | | |
| Admin Portal - User Detail | 9 | | | |
| Admin Portal - Circles | 7 | | | |
| Admin Portal - Health Alerts | 10 | | | |
| Admin Portal - Medications | 9 | | | |
| Admin Portal - AI Usage | 9 | | | |
| Admin Portal - Feature Flags | 7 | | | |
| Admin Portal - Audit Logs | 5 | | | |
| Admin Portal - Settings | 6 | | | |
| Admin Portal - Navigation | 4 | | | |
| Backend API | 40 | | | |
| Cross-Platform E2E | 13 | | | |
| Performance | 10 | | | |
| Security | 15 | | | |
| Accessibility | 8 | | | |
| **TOTAL** | **~450** | | | |

---

*Testing plan prepared for Karuna 2026 v1.0.0. Testers should update Pass/Fail columns as they execute each test case.*
