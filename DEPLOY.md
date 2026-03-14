# Deploying Vocab Forge: TestFlight, Cloud Functions & Web

This guide walks you through getting the app on TestFlight for your dad’s iPhone, deploying Cloud Functions to production, and hosting the web app on Firebase.

**Branch:** Use the `deploy/testflight-and-production` branch. The app is configured to call **production** Cloud Functions (no local emulator).

---

## Prerequisites

- **Apple Developer Program** ($99/year) – required for TestFlight
- **Node.js** (for Firebase CLI and Cloud Functions)
- **Flutter** installed and on your PATH
- **Firebase CLI**: `npm install -g firebase-tools` then `firebase login`
- **Xcode** (Mac) for building and uploading the iOS app

---

## 1. Deploy Cloud Functions (so the app talks to real backend)

Functions run in your Firebase project `vocab-forge-78557`. Deploy them first so the iOS app and web app use the live backend.

```bash
# From project root
cd /Users/ronshaked/Developer/repos/vocab_forge

# Install functions dependencies if you haven’t
cd functions && npm install && cd ..

# Deploy only Cloud Functions
firebase deploy --only functions
```

- Pre-deploy will run `npm run lint` and `npm run build` in `functions/`.
- When it finishes, your callable functions (e.g. `getHomePageData`, `getVocabSession`, etc.) are live at `https://us-central1-vocab-forge-78557.cloudfunctions.net/...` (or your configured region).
- The Flutter app uses the default Firebase project, so it will call these deployed functions automatically (no emulator).

**Optional – deploy Firestore rules too:**

```bash
firebase deploy --only firestore:rules
```

---

## 2. Host the Web App (Flutter web on Firebase Hosting)

The `firebase.json` in this branch includes **hosting** with `public: build/web` (Flutter web output).

```bash
# From project root
flutter build web
firebase deploy --only hosting
```

After deploy, the site will be at:

- **https://vocab-forge-78557.web.app**  
- **https://vocab-forge-78557.firebaseapp.com**

(Exact URLs appear in the Firebase CLI output.)

---

## 3. Put the iOS App on TestFlight (for your dad’s iPhone)

### 3.1 Apple Developer & App Store Connect

1. **Apple Developer account**  
   Enroll at [developer.apple.com](https://developer.apple.com) if you haven’t.

2. **App in App Store Connect**  
   - Go to [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.  
   - Choose **iOS**, name (e.g. “Vocab Forge”), language, bundle ID.  
   - **Bundle ID** must match the app. Current value in the project: **`com.example.vocabForge`**.  
   - For a real product you may want a custom ID (e.g. `com.yourname.vocabforge`). If you change it, update:
     - Xcode: **Runner** target → **Signing & Capabilities** → Bundle Identifier  
     - And run `dart run flutterfire configure` so Firebase stays in sync.

### 3.2 Xcode signing

1. Open the iOS project in Xcode:
   ```bash
   open ios/Runner.xcworkspace
   ```
2. Select the **Runner** project → **Runner** target.
3. **Signing & Capabilities**:
   - Check **Automatically manage signing**.
   - Choose your **Team** (your Apple Developer account).
   - Set **Bundle Identifier** to the one you use in App Store Connect (e.g. `com.example.vocabForge` or your custom ID).

### 3.3 Build and upload to TestFlight

From the project root:

```bash
# Release build (no emulator; uses production Cloud Functions)
flutter build ios --release
```

Then in Xcode:

1. **Product** → **Destination** → **Any iOS Device (arm64)**.
2. **Product** → **Archive**.
3. When the Organizer appears, select the archive and click **Distribute App**.
4. Choose **App Store Connect** → **Upload**.
5. Follow the prompts (e.g. automatic signing, upload).
6. In App Store Connect, open your app → **TestFlight**. After processing (often 5–15 minutes), the build appears under **iOS Builds**.

### 3.4 Add your dad as a tester

1. In App Store Connect: **TestFlight** tab → **Internal Testing** or **External Testing**.
2. **Internal Testing**: add his Apple ID email (he must have an Apple ID). He gets an invite and installs via the TestFlight app.
3. **External Testing**: create a group, add his email, submit the build for Beta App Review (first time can take a day). Once approved, he gets the TestFlight invite.

Your dad installs **TestFlight** from the App Store, accepts the invite, then installs **Vocab Forge** from TestFlight.

---

## Quick reference: deploy order

| Step | Command / action |
|------|-------------------|
| 1. Functions | `firebase deploy --only functions` |
| 2. Web       | `flutter build web` then `firebase deploy --only hosting` |
| 3. iOS       | `flutter build ios --release`, then Xcode → Archive → Distribute to App Store Connect → TestFlight |

---

## Deploying only one part

- **Only Cloud Functions:**  
  `firebase deploy --only functions`

- **Only hosting:**  
  `flutter build web && firebase deploy --only hosting`

- **Only Firestore rules:**  
  `firebase deploy --only firestore:rules`

---

## Troubleshooting

- **“No Firebase project”**  
  Run `firebase use vocab-forge-78557` (or your project ID from `.firebaserc`).

- **iOS build / signing errors**  
  Confirm Bundle ID in Xcode matches App Store Connect and that the Runner target has a valid Team and provisioning profile.

- **App can’t reach backend**  
  Ensure you’ve run `firebase deploy --only functions` and that the app is not using the emulator (this branch has emulator usage removed).

- **Web build fails**  
  Run `flutter pub get` and `flutter clean` then `flutter build web` again.
