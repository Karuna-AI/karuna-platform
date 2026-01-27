# Karuna AI Companion Platform

**A comprehensive AI-powered companion platform designed for elderly users, featuring voice interaction, multilingual support (50+ languages), health tracking, secure vault storage, and caregiver coordination.**

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [System Integration](#system-integration)
4. [Project Structure](#project-structure)
5. [Features](#features)
6. [Technology Stack](#technology-stack)
7. [Data Flows](#data-flows)
8. [Services Reference](#services-reference)
9. [Components Reference](#components-reference)
10. [API Reference](#api-reference)
11. [Setup & Installation](#setup--installation)
12. [Testing](#testing)
13. [Security & Privacy](#security--privacy)
14. [Deployment](#deployment)

---

## Overview

Karuna is an AI companion designed specifically for elderly users, providing:

- **Voice-first interaction** with speech-to-text and text-to-speech in 50+ languages
- **Proactive health monitoring** with medication reminders and wellness check-ins
- **Secure vault storage** for personal documents, accounts, and medical information
- **Care circle coordination** allowing family members to stay connected
- **Intent-based actions** for calling, messaging, booking rides, and more

```
+------------------+     +------------------+     +------------------+     +------------------+
|   Mobile App     |     |   Web Dashboard  |     | Caregiver Portal |     |  Admin Portal    |
|  (React Native)  |     |  (React Native   |     |     (React)      |     |    (React)       |
|   Port: 3020     |     |      Web)        |     |   Port: 3030     |     |   Port: 3040     |
+--------+---------+     +--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |                        |
         v                        v                        v                        v
+-------------------------------------------------------------------------------------------+
|                               Gateway Server (Port: 3021)                                  |
|   - OpenAI Proxy (GPT-4, Whisper)                                                         |
|   - Rate Limiting & Security                                                               |
|   - Care Circle API (/api/care/*)                                                         |
|   - Admin API (/api/admin/*)                                                              |
|   - WebSocket Real-time Sync                                                              |
+-------------------------------------------------------------------------------------------+
         |
         v
+------------------+          +------------------+
|    OpenAI API    |          |   PostgreSQL     |
|  - GPT-4 Chat    |          |   Port: 5437     |
|  - Whisper STT   |          +------------------+
+------------------+
```

---

## Architecture

### System Architecture Diagram

```
                                    KARUNA PLATFORM ARCHITECTURE

    +-----------------------------------------------------------------------------------+
    |                                 CLIENT LAYER                                       |
    +-----------------------------------------------------------------------------------+
    |                                                                                    |
    |   +------------------------+  +------------------------+  +---------------------+ |
    |   |     MOBILE APP         |  |     WEB APP            |  |   CAREGIVER PORTAL  | |
    |   |   (React Native)       |  |  (React Native Web)    |  |   (React + Vite)    | |
    |   |                        |  |                        |  |   Port: 3030        | |
    |   |  +------------------+  |  |  +------------------+  |  |  +---------------+  | |
    |   |  | Chat Screen      |  |  |  | Same Components  |  |  |  | Dashboard     |  | |
    |   |  | Voice Input      |  |  |  | Web Mocks for    |  |  |  | Member Mgmt   |  | |
    |   |  | Health Dashboard |  |  |  | Native APIs      |  |  |  | Vault View    |  | |
    |   |  | Vault Screen     |  |  |  +------------------+  |  |  | Notes         |  | |
    |   |  | Settings         |  |  |                        |  |  +---------------+  | |
    |   |  +------------------+  |  +------------------------+  +---------------------+ |
    |   +------------------------+                                                      |
    +-----------------------------------------------------------------------------------+
                         |                                               |
                         | HTTP + WebSocket                              | HTTP /api/*
                         |                                               | (Vite proxy)
                         v                                               v
    +-----------------------------------------------------------------------------------+
    |                                 SERVICE LAYER                                      |
    +-----------------------------------------------------------------------------------+
    |                                                                                    |
    |  +------------------+  +------------------+  +------------------+                  |
    |  | GATEWAY SERVER   |  | CARE CIRCLE API  |  | WEBSOCKET SERVER |                 |
    |  | (Express.js)     |  | (Express.js)     |  | (ws)             |                 |
    |  | Port: 3021       |  | Port: 3021       |  | Port: 3021/ws    |                 |
    |  |                  |  |                  |  |                  |                  |
    |  | - /api/chat      |  | - /api/care/*    |  | - /ws            |                  |
    |  | - /api/stt       |  | - Auth (JWT)     |  | - Real-time sync |                  |
    |  | - /api/telemetry |  | - RBAC           |  | - Notifications  |                  |
    |  | - Rate limiting  |  | - Invitations    |  |                  |                  |
    |  +------------------+  +------------------+  +------------------+                  |
    |                                                                                    |
    +-----------------------------------------------------------------------------------+
                                              |
                                              | pg connection pool
                                              v
    +-----------------------------------------------------------------------------------+
    |                                 DATA LAYER                                         |
    +-----------------------------------------------------------------------------------+
    |                                                                                    |
    |  +------------------------------------+  +------------------+                      |
    |  | PostgreSQL Database               |  | OpenAI API       |                      |
    |  | (Docker: karuna-postgres)         |  |                  |                      |
    |  | Port: 5437                        |  | - GPT-4 Chat     |                      |
    |  |                                   |  | - Whisper STT    |                      |
    |  | Tables:                           |  +------------------+                      |
    |  | - users                           |                                            |
    |  | - care_circles                    |  +------------------+                      |
    |  | - circle_members                  |  | Device Services  |                      |
    |  | - invitations                     |  |                  |                      |
    |  | - vault_* (8 tables)              |  | - HealthKit      |                      |
    |  | - sync_changes                    |  | - Health Connect |                      |
    |  | - sessions                        |  | - TTS (native)   |                      |
    |  | - health_data                     |  | - Contacts       |                      |
    |  | - audit_logs                      |  +------------------+                      |
    |  +------------------------------------+                                            |
    |                                                                                    |
    +-----------------------------------------------------------------------------------+
```

### Voice Pipeline Flow

```
    USER SPEAKS
         |
         v
    +--------------------+
    | Voice Recording    |
    | (MediaRecorder /   |
    |  expo-av)          |
    +--------------------+
         |
         v
    +--------------------+
    | Gateway Server     |
    | /api/stt           |
    +--------------------+
         |
         v
    +--------------------+
    | OpenAI Whisper     |
    | (with language     |
    |  hint from 50+     |
    |  supported langs)  |
    +--------------------+
         |
         v
    +--------------------+
    | Transcribed Text   |
    +--------------------+
         |
         +---> Intent Detection (local)
         |            |
         v            v
    +--------------------+     +--------------------+
    | Gateway Server     |     | Intent Actions     |
    | /api/chat (GPT-4)  |     | - Call contact     |
    |                    |     | - Send message     |
    | Safety System      |     | - Book ride        |
    | Prompt included    |     | - Play music       |
    +--------------------+     +--------------------+
         |
         v
    +--------------------+
    | AI Response Text   |
    +--------------------+
         |
         v
    +--------------------+
    | Platform TTS       |
    | (iOS/Android/Web)  |
    | Voice selected per |
    | language config    |
    +--------------------+
         |
         v
    AUDIO OUTPUT TO USER
```

### Care Circle Data Sync Flow

```
    MOBILE DEVICE (Elderly User)
         |
         | Push vault changes
         v
    +--------------------+
    | Care Circle API    |
    | POST /sync         |
    +--------------------+
         |
         | Broadcast via WebSocket
         v
    +--------------------+
    | Connected Clients  |
    | - Caregiver Portal |
    | - Other family     |
    +--------------------+
         |
         | Pull changes
         v
    +--------------------+
    | Caregiver Portal   |
    | View medications,  |
    | appointments, etc. |
    +--------------------+
         |
         | Add notes/updates
         v
    +--------------------+
    | Care Circle API    |
    | POST /vault/:type  |
    +--------------------+
         |
         | Sync back to device
         v
    MOBILE DEVICE
```

---

## System Integration

### Integration Architecture

This section provides detailed technical information about how the Caregiver Portal, Mobile App, and PostgreSQL Database integrate with each other.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     COMPLETE INTEGRATION ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐          ┌───────────────────┐                       │
│  │  CAREGIVER PORTAL │          │    MOBILE APP     │                       │
│  │  (React + Vite)   │          │  (React Native)   │                       │
│  │   Port: 3030      │          │                   │                       │
│  │                   │          │  AsyncStorage:    │                       │
│  │  localStorage:    │          │  - device_id      │                       │
│  │  - auth_token     │          │  - care_circle_id │                       │
│  │                   │          │  - auth_token     │                       │
│  │  Axios client     │          │  - pending_changes│                       │
│  │  baseURL: /api    │          │                   │                       │
│  └─────────┬─────────┘          └─────────┬─────────┘                       │
│            │                              │                                 │
│            │  Vite proxy to :3021         │  HTTP + WebSocket               │
│            │                              │                                 │
│            └──────────────┬───────────────┘                                 │
│                           ▼                                                 │
│              ┌─────────────────────────┐                                    │
│              │     EXPRESS SERVER      │                                    │
│              │     Port: 3021          │                                    │
│              │                         │                                    │
│              │  Middleware:            │                                    │
│              │  • Helmet (security)    │                                    │
│              │  • CORS (multi-origin)  │                                    │
│              │  • Rate limiting        │                                    │
│              │  • JWT authentication   │                                    │
│              │                         │                                    │
│              │  Routes:                │                                    │
│              │  • /api/chat (OpenAI)   │                                    │
│              │  • /api/stt (Whisper)   │                                    │
│              │  • /api/care/* (CRUD)   │                                    │
│              │  • /ws (WebSocket)      │                                    │
│              └────────────┬────────────┘                                    │
│                           │                                                 │
│                           │  pg connection pool (max: 20)                   │
│                           ▼                                                 │
│              ┌─────────────────────────┐                                    │
│              │     POSTGRESQL DB       │                                    │
│              │   (Docker container)    │                                    │
│              │                         │                                    │
│              │  Container: karuna-postgres                                  │
│              │  Port: 5437 → 5432      │                                    │
│              │  User: karuna           │                                    │
│              │  Password: ganesh       │                                    │
│              │  Database: karuna       │                                    │
│              └─────────────────────────┘                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Caregiver Portal → Server Integration

| Component | Details |
|-----------|---------|
| **Frontend** | React + TypeScript + Vite |
| **Port** | 3030 (configured), 5173/5174 (Vite dev server) |
| **API Client** | Axios with `/api` baseURL, proxied to server |
| **Auth Storage** | JWT tokens stored in `localStorage` |
| **Key Files** | `caregiver-portal/src/services/api.ts` |

**Vite Proxy Configuration** (`caregiver-portal/vite.config.ts`):
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:3021',
    changeOrigin: true,
  },
  '/ws': {
    target: 'ws://localhost:3021',
    ws: true,
  },
}
```

**API Endpoints Used:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/care/auth/register` | POST | User registration |
| `/api/care/auth/login` | POST | User login |
| `/api/care/auth/me` | GET | Get current user profile |
| `/api/care/circles` | GET/POST | List/create care circles |
| `/api/care/circles/:id` | GET | Circle details with members |
| `/api/care/circles/:id/invite` | POST | Send invitations |
| `/api/care/circles/:id/sync` | GET/POST | Vault data sync |
| `/api/care/circles/:id/notes` | POST | Add care notes |
| `/api/care/circles/:id/notes/:noteId` | PUT/DELETE | Update/delete notes |

### 2. Mobile App → Server Integration

| Component | Details |
|-----------|---------|
| **Service** | `CareCircleSyncService` class |
| **Storage** | AsyncStorage for device ID, tokens, pending changes |
| **Connection** | HTTP REST + WebSocket for real-time updates |
| **Key File** | `src/services/careCircleSync.ts` |

**AsyncStorage Keys:**
```typescript
STORAGE_KEYS = {
  CARE_CIRCLE_ID: '@karuna_care_circle_id',
  DEVICE_ID: '@karuna_device_id',
  LAST_SYNC: '@karuna_last_sync',
  PENDING_CHANGES: '@karuna_pending_changes',
  AUTH_TOKEN: '@karuna_care_auth_token',
}
```

**Sync Features:**
- Device ID generation and persistence
- Join care circle via invitation token
- Push local changes to cloud
- Pull remote data to device
- WebSocket for real-time sync updates
- Exponential backoff reconnection (max 5 attempts)
- Offline change queuing

**Sync Flow Diagram:**
```
Mobile App                Server                  Database
    │                        │                        │
    │  POST /sync (changes)  │                        │
    │───────────────────────▶│  INSERT sync_changes   │
    │                        │───────────────────────▶│
    │                        │                        │
    │  WebSocket: sync_update│                        │
    │◀───────────────────────│                        │
    │                        │                        │
    │  GET /sync (pull)      │  SELECT vault_*       │
    │───────────────────────▶│───────────────────────▶│
    │  { medications, ... }  │                        │
    │◀───────────────────────│◀───────────────────────│
```

### 3. Server → PostgreSQL Database Integration

| Component | Details |
|-----------|---------|
| **Database** | PostgreSQL 16 (Alpine) via Docker |
| **Container** | `karuna-postgres` |
| **Port** | 5437 (host) → 5432 (container) |
| **Credentials** | User: `karuna`, Password: `ganesh`, DB: `karuna` |
| **Connection** | `pg` library with connection pooling (max 20) |
| **Key Files** | `server/db/index.js`, `server/db/init.sql` |

**Database Connection Pool Settings:**
```javascript
{
  host: 'localhost',
  port: 5437,
  database: 'karuna',
  user: 'karuna',
  password: 'ganesh',
  max: 20,                      // Max connections
  idleTimeoutMillis: 30000,     // 30s idle timeout
  connectionTimeoutMillis: 2000  // 2s connection timeout
}
```

**Database Schema (15+ Tables):**

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | Caregiver accounts | id, email, password_hash, name, phone |
| `care_circles` | Care circle definitions | id, name, care_recipient_name, settings |
| `circle_members` | Membership with roles | circle_id, user_id, role, status |
| `invitations` | Pending invitations | token, email, role, expires_at |
| `vault_accounts` | Bank/financial accounts | circle_id, name, type, account_number_encrypted |
| `vault_medications` | Medication tracking | name, dosage, frequency, timing[] |
| `vault_doctors` | Doctor directory | name, specialty, hospital, phone |
| `vault_appointments` | Upcoming appointments | date, time, doctor_id, purpose |
| `vault_documents` | Document storage | title, type, file_data_encrypted |
| `vault_contacts` | Emergency contacts | name, relationship, is_emergency |
| `vault_routines` | Daily routines | name, time, days_of_week[] |
| `vault_notes` | Caregiver notes | author_id, title, content, category |
| `sync_changes` | Audit log for sync | entity_type, action, data, version |
| `sessions` | Active sessions | user_id, token_hash, expires_at |
| `health_data` | Health metrics | data_type, value, measured_at |
| `audit_logs` | Security events | action, category, metadata |

### 4. Role-Based Access Control (RBAC)

Defined in `server/careCircle.js:25-95`:

| Permission | Owner | Caregiver | Viewer |
|------------|:-----:|:---------:|:------:|
| `canViewAccounts` | ✓ | ✓ | ✗ |
| `canEditAccounts` | ✓ | ✗ | ✗ |
| `canViewMedications` | ✓ | ✓ | ✓ |
| `canEditMedications` | ✓ | ✓ | ✗ |
| `canViewDocuments` | ✓ | ✓ | ✗ |
| `canEditDocuments` | ✓ | ✗ | ✗ |
| `canViewDoctors` | ✓ | ✓ | ✓ |
| `canEditDoctors` | ✓ | ✓ | ✗ |
| `canViewAppointments` | ✓ | ✓ | ✓ |
| `canEditAppointments` | ✓ | ✓ | ✗ |
| `canViewContacts` | ✓ | ✓ | ✓ |
| `canEditContacts` | ✓ | ✓ | ✗ |
| `canViewVault` | ✓ | ✓ | ✓ |
| `canViewSensitive` | ✓ | ✗ | ✗ |
| `canAddNotes` | ✓ | ✓ | ✓ |
| `canViewAllNotes` | ✓ | ✓ | ✗ |
| `canInviteMembers` | ✓ | ✗ | ✗ |
| `canRemoveMembers` | ✓ | ✗ | ✗ |
| `canChangeRoles` | ✓ | ✗ | ✗ |
| `canExportData` | ✓ | ✓ | ✗ |
| `canDeleteCircle` | ✓ | ✗ | ✗ |

### 5. WebSocket Real-Time Sync

**Connection URL:** `ws://localhost:3021/ws?token=<jwt>&circleId=<uuid>`

**Server-to-Client Events:**
```javascript
{ type: 'connected', circleId, timestamp }
{ type: 'sync_update', changes: [...] }
{ type: 'member_joined', member: {...} }
{ type: 'member_left', memberId }
```

**Client-to-Server Events:**
```javascript
{ type: 'ping' }  // Server responds with { type: 'pong' }
{ type: 'auth', token }
{ type: 'subscribe', circleId }
```

### 6. Starting All Services

```bash
# 1. Start PostgreSQL (Docker)
docker-compose up -d

# 2. Start Gateway Server (port 3021)
cd server && npm start

# 3. Start Mobile App Web (port 3020)
npm run web

# 4. Start Caregiver Portal (port 3030)
cd caregiver-portal && npm run dev

# 5. Start Admin Portal (port 3040)
cd admin-portal && npm run dev

# 6. Start Mobile App (optional)
npm run ios  # or npm run android
```

**All Services Running:**
| Service | URL |
|---------|-----|
| Mobile App (Web) | http://localhost:3020 |
| Gateway Server | http://localhost:3021 |
| Caregiver Portal | http://localhost:3030 |
| Admin Portal | http://localhost:3040 |

### 7. CORS Configuration

The server allows requests from multiple origins (`server/index.js:43-47`):
```javascript
origin: [
  'http://localhost:3020',   // Mobile app web
  'http://localhost:3000',   // Alternative web
  'http://localhost:5173',   // Vite dev server
  'http://localhost:5174',   // Vite alternate port
  'http://localhost:3030',   // Caregiver portal
  'http://localhost:3040',   // Admin portal
],
methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
allowedHeaders: ['Content-Type', 'X-Request-ID', 'X-Client-Version', 'Authorization']
```

---

## Project Structure

```
karuna2026/
├── src/                          # Main application source
│   ├── App.tsx                   # Main entry point, navigation
│   ├── components/               # UI Components
│   │   ├── ChatScreen.tsx        # Main chat interface
│   │   ├── ChatBubble.tsx        # Message display
│   │   ├── VoiceButton.tsx       # Voice recording button
│   │   ├── VaultScreen.tsx       # Secure vault main screen
│   │   ├── VaultAccountScreen.tsx
│   │   ├── VaultMedicationScreen.tsx
│   │   ├── VaultDocumentScreen.tsx
│   │   ├── HealthDashboard.tsx   # Health metrics display
│   │   ├── CareCircleScreen.tsx  # Care circle management
│   │   ├── SettingsScreen.tsx    # App settings
│   │   ├── LockScreen.tsx        # PIN/biometric lock
│   │   ├── CheckInCard.tsx       # Proactive check-ins
│   │   ├── IntentActionModal.tsx # Action confirmations
│   │   └── LanguageSelector.tsx  # 50+ language picker
│   │
│   ├── services/                 # Business logic services
│   │   ├── openai.ts             # OpenAI API (chat, STT)
│   │   ├── tts.ts                # Text-to-speech service
│   │   ├── storage.ts            # AsyncStorage persistence
│   │   ├── vault.ts              # Encrypted vault CRUD
│   │   ├── encryption.ts         # AES-256-GCM encryption
│   │   ├── healthData.ts         # HealthKit/Health Connect
│   │   ├── medication.ts         # Medication tracking
│   │   ├── memory.ts             # Conversation memory
│   │   ├── intents.ts            # Intent detection
│   │   ├── intentActions.ts      # Intent execution
│   │   ├── contacts.ts           # Device contacts
│   │   ├── careCircleSync.ts     # Care circle client sync
│   │   ├── biometricAuth.ts      # Biometric authentication
│   │   ├── auditLog.ts           # Security audit logging
│   │   ├── consent.ts            # User consent management
│   │   ├── proactiveEngine.ts    # Proactive check-in engine
│   │   ├── languageService.ts    # Language management
│   │   ├── transliteration.ts    # Script transliteration
│   │   ├── appLauncher.ts        # Deep link launching
│   │   ├── otpAssistant.ts       # OTP reading assistance
│   │   └── telemetry.ts          # Error reporting
│   │
│   ├── hooks/                    # React hooks
│   │   ├── useChat.ts            # Chat state management
│   │   ├── useVoiceInput.ts      # Voice recording logic
│   │   └── useTTS.ts             # TTS hook
│   │
│   ├── context/                  # React contexts
│   │   ├── SettingsContext.tsx   # App settings state
│   │   └── ChatContext.tsx       # Chat state provider
│   │
│   ├── i18n/                     # Internationalization
│   │   ├── languages.ts          # 50+ language configs
│   │   ├── translations.ts       # UI translations
│   │   └── useTranslation.ts     # Translation hook
│   │
│   ├── types/                    # TypeScript definitions
│   │   ├── index.ts              # Core types
│   │   ├── vault.ts              # Vault entity types
│   │   ├── health.ts             # Health data types
│   │   ├── careCircle.ts         # Care circle types
│   │   ├── consent.ts            # Consent types
│   │   ├── proactive.ts          # Proactive feature types
│   │   └── actions.ts            # Intent action types
│   │
│   ├── utils/                    # Utilities
│   │   └── accessibility.ts      # Accessibility helpers
│   │
│   └── web/                      # Web-specific mocks
│       ├── tts-mock.ts           # Web TTS polyfill
│       ├── audio-recorder-mock.ts
│       ├── async-storage-mock.ts
│       ├── expo-*.ts             # Expo module mocks
│       └── slider-mock.tsx
│
├── server/                       # Backend server
│   ├── index.js                  # Gateway server entry
│   ├── careCircle.js             # Care circle API (PostgreSQL)
│   └── db/                       # Database layer
│       ├── index.js              # Connection pool & queries
│       └── init.sql              # Schema (15+ tables)
│
├── docker-compose.yml            # PostgreSQL container config
│
├── caregiver-portal/             # Caregiver web dashboard
│   ├── src/
│   │   ├── App.tsx               # Portal entry
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── CareCircleDetail.tsx
│   │   │   └── AcceptInvitation.tsx
│   │   ├── services/
│   │   │   └── api.ts            # API client
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   └── components/
│   │       └── Layout.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── admin-portal/                 # Admin management portal
│   ├── src/
│   │   ├── App.tsx               # Portal entry
│   │   ├── pages/
│   │   │   ├── Login.tsx         # Admin login
│   │   │   ├── Dashboard.tsx     # System metrics
│   │   │   ├── Users.tsx         # User management
│   │   │   ├── UserDetail.tsx    # User details
│   │   │   ├── Circles.tsx       # Circle management
│   │   │   ├── CircleDetail.tsx  # Circle details
│   │   │   ├── AIUsageAnalytics.tsx  # AI usage & costs
│   │   │   ├── HealthAlerts.tsx  # Health alerts dashboard
│   │   │   ├── MedicationReports.tsx # Medication adherence
│   │   │   ├── FeatureFlags.tsx  # Feature toggles
│   │   │   ├── AuditLogs.tsx     # Audit log viewer
│   │   │   └── Settings.tsx      # System settings
│   │   ├── services/
│   │   │   └── api.ts            # Admin API client
│   │   ├── context/
│   │   │   └── AuthContext.tsx   # Admin auth
│   │   └── components/
│   │       └── Layout.tsx        # Admin layout
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── __tests__/                    # Test suite (602 tests)
│   ├── jest.config.js
│   ├── setup/
│   │   └── setupTests.ts
│   ├── services/
│   ├── hooks/
│   ├── components/
│   ├── context/
│   ├── integration/
│   ├── e2e/
│   └── server/
│
├── package.json
├── webpack.config.js             # Web build config
├── metro.config.js               # React Native bundler
└── tsconfig.json
```

---

## Features

### Core Features

| Feature | Description | Status |
|---------|-------------|--------|
| Voice Chat | Press-to-talk voice input with Whisper STT | Complete |
| AI Companion | GPT-4 powered conversations with safety rules | Complete |
| Text-to-Speech | Platform-native TTS with voice selection | Complete |
| 50+ Languages | Full voice pipeline for 50+ languages | Complete |
| Secure Vault | Encrypted storage for personal data | Complete |
| Health Tracking | HealthKit/Health Connect integration | Complete |
| Care Circle | Family coordination with RBAC | Complete |
| Proactive Check-ins | Smart wellness reminders | Complete |
| Intent Actions | Call, message, book rides, play music | Complete |

### Language Support (50+ Languages)

```
+------------------+------------------+------------------+------------------+
| English (en)     | Hindi (hi)       | Bengali (bn)     | Tamil (ta)       |
| Spanish (es)     | French (fr)      | German (de)      | Italian (it)     |
| Portuguese (pt)  | Russian (ru)     | Japanese (ja)    | Korean (ko)      |
| Chinese (zh)     | Arabic (ar)      | Turkish (tr)     | Vietnamese (vi)  |
| Thai (th)        | Indonesian (id)  | Malay (ms)       | Filipino (fil)   |
| ... and 30+ more with regional variants                                  |
+------------------+------------------+------------------+------------------+

Each language includes:
- Whisper STT language code
- Platform-specific TTS voices (iOS, Android, Web)
- Speech rate optimization
- Transliteration support (for Devanagari scripts)
- RTL support (for Arabic, Hebrew, Urdu)
- Locale settings (date/time, currency, emergency numbers)
```

### Vault Categories

```
+------------------+------------------------------------------+
| Category         | Data Types                               |
+------------------+------------------------------------------+
| Accounts         | Bank accounts, credit cards, insurance   |
| Medications      | Name, dosage, frequency, reminders       |
| Doctors          | Contact info, specialty, consultation    |
| Appointments     | Date, time, location, preparation notes  |
| Documents        | ID proofs, wills, property papers        |
| Contacts         | Emergency contacts, family, neighbors    |
| Routines         | Daily schedules, habits                  |
| Notes            | Care notes from caregivers               |
+------------------+------------------------------------------+
```

### Care Circle Roles & Permissions

```
+------------+------------------+------------------+------------------+
| Permission | Owner            | Caregiver        | Viewer           |
+------------+------------------+------------------+------------------+
| View Meds  | Yes              | Yes              | Yes              |
| Edit Meds  | Yes              | Yes              | No               |
| View Docs  | Yes              | Yes              | No               |
| Edit Docs  | Yes              | No               | No               |
| View Accts | Yes              | Yes              | No               |
| Add Notes  | Yes              | Yes              | Yes              |
| Invite     | Yes              | No               | No               |
| Remove     | Yes              | No               | No               |
| Delete     | Yes              | No               | No               |
+------------+------------------+------------------+------------------+
```

### Admin Portal

The Admin Portal provides platform-wide management capabilities for administrators.

#### Admin Roles & Permissions

| Permission | Super Admin | Admin | Support |
|------------|:-----------:|:-----:|:-------:|
| Manage Admins | Yes | No | No |
| Manage Users | Yes | Yes | Yes |
| Manage Circles | Yes | Yes | Yes |
| Manage Settings | Yes | No | No |
| Manage Feature Flags | Yes | Yes | No |
| View Metrics | Yes | Yes | Yes |
| View Audit Logs | Yes | Yes | Yes |
| Send Notifications | Yes | Yes | No |
| Export Data | Yes | Yes | No |

#### Feature Flags

Feature flags allow dynamic control of app features without code deployment:

| Flag | Description | Default |
|------|-------------|---------|
| `proactive_checkins` | Enable wellness check-ins | Enabled |
| `medication_reminders` | Medication notifications | Enabled |
| `voice_conversations` | Voice AI interactions | Enabled |
| `health_monitoring` | Health data tracking | Enabled |
| `caregiver_alerts` | Real-time caregiver alerts | Enabled |
| `ai_memory` | Conversation memory | Enabled |
| `emergency_sos` | Emergency SOS feature | Enabled |
| `dark_mode` | Dark mode UI option | Disabled |
| `beta_features` | Beta feature access | Disabled |

#### System Settings

Configurable system settings managed via Admin Portal:

| Setting | Category | Description |
|---------|----------|-------------|
| `max_circles_per_user` | limits | Max care circles per user (default: 5) |
| `max_members_per_circle` | limits | Max members per circle (default: 10) |
| `session_timeout_hours` | security | User session timeout (default: 168h) |
| `ai_daily_token_limit` | ai | Daily AI token limit per user |
| `enable_voice_features` | general | Enable voice input/output |
| `enable_health_sync` | general | Enable health data sync |
| `maintenance_mode` | general | Put system in maintenance mode |

#### Admin Dashboards

The Admin Portal includes comprehensive dashboards for monitoring and analytics:

**AI Usage Analytics** (`/ai-usage`)
| Metric | Description |
|--------|-------------|
| Total Requests | Chat, STT, TTS request counts |
| Token Usage | Prompt and completion tokens |
| Cost Estimation | Estimated OpenAI API costs |
| Success Rate | Request success/failure rates |
| Latency | Average response times |
| Daily Trends | Usage patterns over time |

**Health Alerts Dashboard** (`/health-alerts`)
| Feature | Description |
|---------|-------------|
| Active Alerts | Current unresolved alerts by severity |
| Alert Types | Breakdown by alert category |
| Recent Critical | High-priority alerts needing attention |
| Top Circles | Care circles with most alerts |
| Trend Analysis | Alert patterns over time |

**Medication Reports** (`/medications`)
| Feature | Description |
|---------|-------------|
| Adherence Rate | Overall medication compliance percentage |
| By Care Recipient | Individual adherence tracking |
| Common Medications | Most prescribed medications |
| Missed Doses | Recent missed medications |
| Hourly Patterns | Time-of-day compliance analysis |

#### Admin Database Tables

| Table | Purpose |
|-------|---------|
| `admin_users` | Admin accounts with roles |
| `system_settings` | Global configuration |
| `feature_flags` | Feature toggles |
| `system_metrics` | Usage analytics |
| `admin_audit_logs` | Admin action tracking |
| `notification_queue` | System notifications |
| `ai_usage_logs` | AI API request tracking |

### App Launcher & Deep Links

Karuna can open and interact with other installed apps on the device using deep links. Users can request actions via voice, and after confirmation, the app launches the appropriate external app with pre-filled data.

#### Supported Apps & Actions

**Transportation (Ride-Hailing)**
| App | Actions | Example Voice Command |
|-----|---------|----------------------|
| **Uber** | Book ride with destination | "Book me an Uber to the hospital" |
| **Ola** | Book ride with destination | "Get an Ola to mother's house" |
| **Lyft** | Book ride with destination | "I need a Lyft to the pharmacy" |

**Navigation & Maps**
| App | Actions | Example Voice Command |
|-----|---------|----------------------|
| **Google Maps** | Navigate, Search, Find nearby | "Navigate to City Hospital" |
| **Apple Maps** | Navigate (iOS only) | "Show me directions to the market" |
| - | Find nearby places | "Find pharmacies near me" |

**Entertainment**
| App | Actions | Example Voice Command |
|-----|---------|----------------------|
| **YouTube** | Search videos, Play specific video | "Play relaxing music on YouTube" |
| **Spotify** | Search and play music | "Play old Hindi songs on Spotify" |

**Communication**
| App | Actions | Example Voice Command |
|-----|---------|----------------------|
| **Phone** | Make calls | "Call my son Rahul" |
| **WhatsApp** | Send messages | "Send WhatsApp to daughter" |
| **SMS** | Send text messages | "Text my doctor" |

**Shopping**
| App | Actions | Example Voice Command |
|-----|---------|----------------------|
| **Amazon** | Search products | "Search for blood pressure monitor on Amazon" |

**Health & Emergency**
| App | Actions | Example Voice Command |
|-----|---------|----------------------|
| **Emergency** | Call 911/112 | "Call emergency services" |
| **Maps** | Find hospital/pharmacy | "Find nearest hospital" |

#### Deep Link Flow

```
    USER VOICE COMMAND
    "Book me an Uber to City Hospital"
              |
              v
    +--------------------+
    | Intent Detection   |
    | Type: uber_ride    |
    | Dest: City Hospital|
    +--------------------+
              |
              v
    +--------------------+
    | Confirmation Modal |
    | "Request an Uber   |
    |  to City Hospital?"|
    | [Yes] [Cancel]     |
    +--------------------+
              |
              v (User confirms)
    +--------------------+
    | Build Deep Link    |
    | uber://?action=    |
    | setPickup&dropoff= |
    | City+Hospital      |
    +--------------------+
              |
              v
    +--------------------+
    | Check if Installed |
    | Linking.canOpenURL |
    +--------------------+
         /        \
        /          \
    Installed    Not Installed
       |              |
       v              v
    +--------+  +-------------+
    | Open   |  | Web Fallback|
    | Uber   |  | m.uber.com  |
    | App    |  | OR          |
    +--------+  | App Store   |
                +-------------+
```

#### Safety Features

- **Confirmation Required**: All actions require user confirmation before execution
- **Sensitive Data Blocking**: Requests containing passwords, credit card numbers, or financial details are blocked
- **Cooldown Protection**: 2-second cooldown prevents accidental double-taps
- **Audit Logging**: All actions are logged for security review
- **Emergency Warnings**: Emergency calls show warning before proceeding

#### App Catalog (Deep Link Schemes)

```
+---------------+------------------+--------------------------------+
| App           | URL Scheme       | Package/Bundle ID              |
+---------------+------------------+--------------------------------+
| Uber          | uber://          | com.ubercab                    |
| Ola           | olacabs://       | com.olacabs.customer           |
| Lyft          | lyft://          | me.lyft.android                |
| Google Maps   | comgooglemaps:// | com.google.android.apps.maps   |
| Apple Maps    | maps://          | com.apple.Maps (iOS only)      |
| YouTube       | youtube://       | com.google.android.youtube     |
| Spotify       | spotify://       | com.spotify.music              |
| WhatsApp      | whatsapp://      | com.whatsapp                   |
| Amazon        | amzn://          | com.amazon.mShop.android       |
| Phone         | tel://           | (System dialer)                |
+---------------+------------------+--------------------------------+
```

#### Code Reference

| File | Description |
|------|-------------|
| `src/services/appLauncher.ts` | Action execution and validation |
| `src/services/deepLinks.ts` | Deep link catalog and URL building |
| `src/services/intents.ts` | Intent detection from user text |
| `src/types/actions.ts` | Action type definitions |
| `src/components/IntentActionModal.tsx` | Confirmation UI |

---

## Technology Stack

### Frontend

| Layer | Technology | Purpose |
|-------|------------|---------|
| Mobile | React Native 0.73 | Cross-platform native apps |
| Web | React Native Web | Shared components for web |
| State | React Context | Global state management |
| Storage | AsyncStorage | Persistent local storage |
| Crypto | Web Crypto API | AES-256-GCM encryption |
| Audio | expo-av / MediaRecorder | Voice recording |
| Health | HealthKit / Health Connect | Health data integration |

### Backend

| Layer | Technology | Purpose |
|-------|------------|---------|
| Server | Node.js + Express | API gateway |
| Database | PostgreSQL 16 | Persistent data storage |
| ORM/Query | pg (node-postgres) | Connection pooling & queries |
| Auth | JWT | Token-based authentication |
| Realtime | WebSocket (ws) | Live sync updates |
| AI | OpenAI GPT-4 | Conversational AI |
| STT | OpenAI Whisper | Speech-to-text |
| Security | Helmet, CORS, Rate Limit | API protection |
| Container | Docker | PostgreSQL containerization |

### Development

| Tool | Purpose |
|------|---------|
| TypeScript | Type safety |
| Jest | Testing framework |
| Webpack | Web bundling |
| Metro | React Native bundling |
| Vite | Caregiver portal bundling |

---

## Data Flows

### Chat Message Flow

```
1. User taps voice button
   └─> useVoiceInput.startRecording()
       └─> voiceRecorder.startRecording()
           └─> MediaRecorder starts

2. User releases button
   └─> useVoiceInput.stopRecording()
       └─> voiceRecorder.stopRecording()
           └─> Audio blob created

3. Audio sent to gateway
   └─> transcribeAudio(audioPath, languageHint)
       └─> POST /api/stt
           └─> OpenAI Whisper API
               └─> Transcribed text returned

4. Text processed by useChat
   └─> Intent detection (local)
   │   └─> If actionable → Show confirmation modal
   │
   └─> chatWithRetry(messages)
       └─> POST /api/chat
           └─> GPT-4 with safety system prompt
               └─> Response text returned

5. Response spoken via TTS
   └─> ttsService.speak(response)
       └─> Platform TTS (voice per language)
           └─> Audio output

6. Memory extraction (background)
   └─> memoryService.processConversation()
       └─> Extract key people, preferences
           └─> Update system prompt context
```

### Health Data Flow

```
1. User grants consent
   └─> consentService.grantConsent('health_data')
       └─> auditLogService.log()

2. Health service initializes
   └─> healthDataService.initialize()
       └─> HealthKit.requestAuthorization() / Health Connect

3. Data sync
   └─> healthDataService.syncAllData()
       └─> Read vitals, steps, sleep
           └─> Store locally (encrypted)

4. User asks about health
   └─> detectHealthQuery(text)
       └─> executeHealthQuery(query)
           └─> Return formatted health data

5. Care circle sync
   └─> careCircleSyncService.pushChanges()
       └─> POST /api/care/circles/:id/sync
           └─> WebSocket broadcast to caregivers
```

### Vault Encryption Flow

```
1. First-time setup
   └─> vaultService.createVault(pin)
       └─> encryptionService.initialize(pin)
           └─> Generate salt (stored locally)
           └─> Derive key via PBKDF2 (SHA-256)
           └─> Store key verification token

2. Vault unlock
   └─> vaultService.unlock(pin)
       └─> encryptionService.initialize(pin)
           └─> Derive key from PIN + salt
           └─> Verify against stored token
           └─> Load and decrypt vault data

3. Data storage
   └─> vaultService.addAccount(data)
       └─> encryptionService.encryptObject(data)
           └─> Generate random IV (12 bytes)
           └─> AES-256-GCM encrypt
           └─> Store: base64(IV + ciphertext)

4. Data retrieval
   └─> vaultService.getAccounts()
       └─> encryptionService.decryptObject(encrypted)
           └─> Extract IV from stored data
           └─> AES-256-GCM decrypt
           └─> Return plaintext object
```

---

## Services Reference

### Core Services

| Service | File | Description |
|---------|------|-------------|
| `openaiService` | `src/services/openai.ts` | Chat and STT API calls |
| `ttsService` | `src/services/tts.ts` | Text-to-speech with language support |
| `storageService` | `src/services/storage.ts` | Message and settings persistence |
| `vaultService` | `src/services/vault.ts` | Encrypted vault CRUD operations |
| `encryptionService` | `src/services/encryption.ts` | AES-256-GCM encryption |
| `memoryService` | `src/services/memory.ts` | Conversation memory extraction |

### Health Services

| Service | File | Description |
|---------|------|-------------|
| `healthDataService` | `src/services/healthData.ts` | HealthKit/Health Connect |
| `medicationService` | `src/services/medication.ts` | Medication tracking |
| `medicalRecordsService` | `src/services/medicalRecords.ts` | Medical document storage |

### Security Services

| Service | File | Description |
|---------|------|-------------|
| `biometricAuthService` | `src/services/biometricAuth.ts` | Biometric authentication |
| `consentService` | `src/services/consent.ts` | User consent management |
| `auditLogService` | `src/services/auditLog.ts` | Security event logging |

### Integration Services

| Service | File | Description |
|---------|------|-------------|
| `careCircleSyncService` | `src/services/careCircleSync.ts` | Care circle data sync |
| `contactsService` | `src/services/contacts.ts` | Device contacts access |
| `calendarService` | `src/services/calendar.ts` | Calendar integration |
| `appLauncherService` | `src/services/appLauncher.ts` | Deep link launching |
| `otpAssistantService` | `src/services/otpAssistant.ts` | OTP reading assistance |

### Language Services

| Service | File | Description |
|---------|------|-------------|
| `languageService` | `src/services/languageService.ts` | Language detection and switching |
| `transliterationService` | `src/services/transliteration.ts` | Script transliteration |

---

## Components Reference

### Main Screens

| Component | File | Description |
|-----------|------|-------------|
| `ChatScreen` | `src/components/ChatScreen.tsx` | Main chat interface |
| `SettingsScreen` | `src/components/SettingsScreen.tsx` | App settings |
| `VaultScreen` | `src/components/VaultScreen.tsx` | Vault home |
| `HealthDashboard` | `src/components/HealthDashboard.tsx` | Health metrics |
| `CareCircleScreen` | `src/components/CareCircleScreen.tsx` | Care circle |
| `LockScreen` | `src/components/LockScreen.tsx` | PIN/biometric |

### UI Components

| Component | File | Description |
|-----------|------|-------------|
| `ChatBubble` | `src/components/ChatBubble.tsx` | Message display |
| `VoiceButton` | `src/components/VoiceButton.tsx` | Voice recording |
| `CheckInCard` | `src/components/CheckInCard.tsx` | Proactive check-ins |
| `IntentActionModal` | `src/components/IntentActionModal.tsx` | Action confirmations |
| `LanguageSelector` | `src/components/LanguageSelector.tsx` | Language picker |

---

## API Reference

### Gateway Server (port 3021)

#### Health Check
```
GET /health
Response: { status: 'healthy', timestamp: '...' }
```

#### Chat Completion
```
POST /api/chat
Body: { messages: [...], memoryContext?: string }
Response: { message: string, usage: {...} }
Rate limit: 20/min
```

#### Speech-to-Text
```
POST /api/stt
Body: FormData { audio: File, language?: string }
Response: { text: string }
Rate limit: 10/min
```

#### Telemetry
```
POST /api/telemetry
Body: { event: string, data: {...} }
```

### Care Circle API

#### Authentication
```
POST /api/care/auth/register
Body: { email, password, name, phone? }
Response: { token, user }

POST /api/care/auth/login
Body: { email, password }
Response: { token, user, circles }
```

#### Care Circles
```
POST /api/care/circles
Body: { name, careRecipientName }
Response: { circle }

GET /api/care/circles
Response: { circles: [...] }

GET /api/care/circles/:id
Response: { circle, member, permissions }
```

#### Invitations
```
POST /api/care/circles/:id/invite
Body: { email, name, role, relationship? }
Response: { invitation }

POST /api/care/invitations/accept
Body: { token, password? }
Response: { token, user, circle }
```

#### Vault Operations
```
GET /api/care/circles/:id/vault
Response: { vault: {...}, syncVersion }

POST /api/care/circles/:id/vault/:entityType
Body: { action: 'create'|'update'|'delete', entityId?, data? }
Response: { entity, syncVersion }
```

#### Sync
```
GET /api/care/circles/:id/sync?since=<version>
Response: { currentVersion, changes, hasMore }

POST /api/care/circles/:id/sync
Body: { deviceId, lastSyncVersion, localChanges }
Response: { currentVersion, changes, conflicts }
```

### Admin API

#### Authentication
```
POST /api/admin/auth/login
Body: { email, password }
Response: { success, token, admin: { id, email, name, role, permissions } }

GET /api/admin/auth/me
Headers: Authorization: Bearer <token>
Response: { admin: { id, email, name, role, permissions } }

POST /api/admin/auth/create (super_admin only)
Body: { email, password, name, role }
Response: { success, admin }
```

#### User Management
```
GET /api/admin/users?page=1&limit=50&search=&status=
Response: { users: [...], pagination: { page, limit, total, pages } }

GET /api/admin/users/:userId
Response: { user, circles, recentActivity }

POST /api/admin/users/:userId/suspend
Body: { reason }
Response: { success }

POST /api/admin/users/:userId/unsuspend
Response: { success }

POST /api/admin/users/:userId/reset-password
Body: { newPassword }
Response: { success }
```

#### Circle Management
```
GET /api/admin/circles?page=1&limit=50&search=
Response: { circles: [...], pagination: { ... } }

GET /api/admin/circles/:circleId
Response: { circle, members, stats }
```

#### Metrics
```
GET /api/admin/metrics/dashboard
Response: { users, circles, activity, alerts, timestamp }

GET /api/admin/metrics/detailed?days=30
Response: { signups, dailyActiveUsers, alertsByType, medicationAdherence }
```

#### Feature Flags
```
GET /api/admin/feature-flags
Response: { flags: [...] }

PUT /api/admin/feature-flags/:flagId
Body: { is_enabled, enabled_for_all, rollout_percentage }
Response: { success, flag }

POST /api/admin/feature-flags
Body: { name, description, is_enabled }
Response: { success, flag }
```

#### System Settings
```
GET /api/admin/settings
Response: { settings: { category: [...], ... } }

PUT /api/admin/settings/:key
Body: { value }
Response: { success, setting }
```

#### Audit Logs
```
GET /api/admin/audit-logs?page=1&limit=100&action=
Response: { logs: [...], pagination: { ... } }

GET /api/admin/admin-audit-logs?page=1&limit=100
Response: { logs: [...], pagination: { ... } }
```

#### Notifications
```
POST /api/admin/notifications/send
Body: { recipient_type, recipient_id, notification_type, title, message, priority }
Response: { success, notification }
```

#### AI Usage Analytics
```
GET /api/admin/ai-usage/summary?days=30
Response: { summary, byModel, byType, dailyUsage, period }

GET /api/admin/ai-usage/logs?page=1&limit=100&request_type=&model=&success=
Response: { logs: [...], pagination: { page, limit } }
```

#### Health Alerts Dashboard
```
GET /api/admin/health-alerts/overview
Response: { summary, bySeverity, byType, recentAlerts, topCircles }

GET /api/admin/health-alerts?page=1&limit=50&status=&severity=&alert_type=&circle_id=
Response: { alerts: [...], pagination: { page, limit, total, pages } }

GET /api/admin/health-alerts/trends?days=30
Response: { dailyAlerts, healthMetrics, period }
```

#### Medication Reports
```
GET /api/admin/medications/overview?days=30
Response: { summary, adherenceByCircle, topMedications, missedDoses, period }

GET /api/admin/medications/trends?days=30
Response: { dailyAdherence, hourlyPattern, period }

GET /api/admin/medications?page=1&limit=50&circle_id=&search=
Response: { medications: [...], pagination: { page, limit } }
```

### WebSocket (ws://localhost:3021/ws)

```
Connect: /ws?token=<jwt>&circleId=<id>

Events received:
- { type: 'connected', circleId, payload: { syncVersion } }
- { type: 'sync_update', circleId, payload: {...} }
- { type: 'member_joined', circleId, payload: {...} }
- { type: 'member_left', circleId, payload: {...} }
- { type: 'note_added', circleId, payload: {...} }

Events sent:
- { type: 'ping' } → Response: { type: 'pong' }
```

---

## Setup & Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker & Docker Compose
- OpenAI API key
- (Mobile) Xcode 15+ / Android Studio

### Quick Start

```bash
# Clone repository
git clone <repo-url>
cd karuna2026

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env and add OPENAI_API_KEY

# Start PostgreSQL database (Docker)
docker-compose up -d
# Verify: docker ps (should show karuna-postgres running)

# Start gateway server
cd server
npm install
npm start  # Runs on port 3021

# Start web app (new terminal)
npm run web  # Runs on port 3020

# Or start mobile app
npm run ios
npm run android
```

### Database Setup

The database automatically initializes when the Docker container starts for the first time.

```bash
# Start PostgreSQL container
docker-compose up -d

# Check container status
docker ps

# View database logs
docker logs karuna-postgres

# Connect to database (optional)
docker exec -it karuna-postgres psql -U karuna -d karuna

# Stop database
docker-compose down

# Stop and remove data (full reset)
docker-compose down -v
```

**Database Connection Details:**
| Setting | Value |
|---------|-------|
| Host | localhost |
| Port | 5437 |
| Database | karuna |
| User | karuna |
| Password | ganesh |

### Caregiver Portal Setup

```bash
cd caregiver-portal
npm install
npm run dev  # Runs on port 3030
```

### Admin Portal Setup

```bash
cd admin-portal
npm install
npm run dev  # Runs on port 3040
```

**Default Admin Credentials:**
- Email: `admin@karuna.com`
- Password: `admin123`

> **Important:** Change the admin password in production!

### Environment Variables

```env
# Required
OPENAI_API_KEY=sk-...

# Optional - Server
PORT=3021
ALLOWED_ORIGINS=http://localhost:3020,http://localhost:3030,http://localhost:3040
JWT_SECRET=your-secret-key
ADMIN_JWT_SECRET=your-admin-secret-key
NODE_ENV=development

# Optional - Database (defaults shown)
DB_HOST=localhost
DB_PORT=5437
DB_NAME=karuna
DB_USER=karuna
DB_PASSWORD=ganesh
DB_LOG_QUERIES=false
```

---

## Testing

### Test Suite Overview

- **602 tests** across 23 test suites
- Unit tests for services, hooks, components
- Integration tests for data flows
- E2E tests for user journeys
- Server tests for API endpoints

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific category
npm run test:services
npm run test:hooks
npm run test:components
npm run test:integration
npm run test:e2e
npm run test:server
```

### Test Structure

```
__tests__/
├── jest.config.js       # Jest configuration
├── setup/
│   └── setupTests.ts    # Global mocks and setup
├── services/            # Service unit tests
├── hooks/               # Hook unit tests
├── components/          # Component tests
├── context/             # Context tests
├── integration/         # Integration tests
├── e2e/                 # End-to-end tests
└── server/              # Server API tests
```

---

## Security & Privacy

### Data Encryption

- **Vault data**: AES-256-GCM with user PIN-derived key
- **Key derivation**: PBKDF2 with device-specific salt
- **At-rest encryption**: All sensitive data encrypted before storage
- **Memory clearing**: Sensitive data cleared when app backgrounds

### Authentication

- **App lock**: PIN or biometric (Face ID / Touch ID / fingerprint)
- **Vault lock**: Separate PIN for vault access
- **JWT tokens**: 7-day expiry for API authentication
- **Auto-lock**: App locks on background

### Privacy Safeguards

- **No server-side storage of conversations**
- **API key server-side only** (never exposed to client)
- **Minimal telemetry** (no PII logged)
- **Consent management** for health data access
- **Audit logging** for security events

### Safety Rules (AI)

The AI assistant includes built-in safety rules:
- No medical diagnoses or treatment advice
- No financial transactions or banking info
- Confirmation required for all actions
- Emergency detection with helpline suggestions
- Scam warnings for elderly protection

---

## Deployment

### Production Checklist

- [ ] Set strong `JWT_SECRET` (min 32 characters)
- [ ] Configure production `ALLOWED_ORIGINS`
- [ ] Enable HTTPS (TLS) for all endpoints
- [ ] Configure PostgreSQL with secure credentials
- [ ] Set up PostgreSQL backups (pg_dump / pg_basebackup)
- [ ] Configure email service for invitations
- [ ] Set up monitoring and alerting (health endpoint)
- [ ] Enable production error tracking
- [ ] Configure CDN for static assets
- [ ] Set up log aggregation

### Server Deployment

```bash
# Build for production
npm run build:web

# Start server
NODE_ENV=production node server/index.js
```

### Mobile Deployment

```bash
# iOS
cd ios && pod install
xcodebuild -workspace Karuna.xcworkspace -scheme Karuna -configuration Release

# Android
cd android
./gradlew assembleRelease
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

### Code Style

- TypeScript strict mode
- ESLint for linting
- Prettier for formatting
- Conventional commits

---

## License

Proprietary - All rights reserved

---

## Support

For issues and feature requests, please open a GitHub issue.

---

*Built with love for elderly users and their caregivers.*
