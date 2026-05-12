# Karuna Release Notes

## v1.x – iOS 26 Compatibility Notes

### Known Limitations on iOS 26

#### 1. Background App Refresh Restrictions
iOS 26 further restricts background execution time for third-party apps. Karuna's background health-data sync (activity, check-ins, adherence) may be deferred or skipped when the device is in low-power mode or background refresh is disabled by the user.

**Workaround:** Open the app periodically to trigger a manual sync. Ensure "Background App Refresh" is enabled for Karuna in iOS Settings.

#### 2. Privacy Manifest Required
Apple now mandates a `PrivacyInfo.xcprivacy` manifest for all apps distributed through the App Store. Karuna declares usage of:
- `NSPrivacyAccessedAPICategoryUserDefaults` – used by AsyncStorage for local vault and session state
- `NSPrivacyAccessedAPICategoryDiskSpace` – used by Expo FileSystem for media attachments

Apps built without this manifest will be **rejected at App Store review**. The manifest is included in the Expo build config as of the current release.

#### 3. HealthKit Permission Re-prompt After Update
iOS 26 resets HealthKit read permissions after a major app update if the app's entitlements have changed. Users upgrading from v0.x may be prompted to re-grant HealthKit access on first launch.

#### 4. Local Notification Authorization Model
iOS 26 requires apps to re-request notification authorization if the previous grant was given under a provisional authorization. Users who previously received provisional notifications may see a new system permission dialog on first launch.

#### 5. expo-crypto / Web Crypto PBKDF2 Availability
On iOS 26 simulator builds, `crypto.subtle.deriveBits` for PBKDF2 may not be available in certain Hermes contexts. Karuna falls back to an iterative SHA-256 key derivation in this case. This fallback is functionally secure but is ~20× slower than native PBKDF2. Production device builds are not affected.

#### 6. Deprecated Navigation APIs (React Native Navigation)
The current in-app navigation relies on a custom screen stack. iOS 26 deprecates several UIKit `UINavigationController` transitions used by older React Native versions. A migration to React Navigation v7 is planned (see roadmap). Until then, users on iOS 26 may notice brief animation jank on screen transitions in the mobile app.

#### 7. WebSocket Background Suspension
iOS 26 suspends WebSocket connections within ~30 seconds of the app entering the background. Karuna's real-time caregiver alert delivery relies on WebSocket. Alerts generated while the app is backgrounded will be delivered via push notification instead, and the WebSocket will reconnect automatically when the app returns to the foreground.

#### 8. Liquid Glass Design System (iOS 26 UI Changes)
iOS 26 introduces a new "Liquid Glass" design language. System UI elements (alerts, action sheets, tab bars) rendered by iOS will adopt this appearance automatically. Custom UI components within Karuna retain their existing appearance and may look visually inconsistent with native elements until a full design-system update is released.

---

### Resolved in this Release

- Fixed vault sync endpoint to enforce per-category patient consent checks
- Fixed admin portal nav items not rendering for non-super-admin roles
- Added idle-session auto-logout (30 min) to caregiver portal
- Added consent-denied toast notifications in caregiver portal
- Added admin notification emails (new admin accounts, user password resets, user provisioning)
- All critical services now meet ≥85% test coverage thresholds

---

### Minimum Requirements

| Platform | Minimum Version |
|----------|----------------|
| iOS      | 16.0           |
| Android  | 10 (API 29)    |
| Node.js  | 20.x           |
| PostgreSQL | 15.x         |
