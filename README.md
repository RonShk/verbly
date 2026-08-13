# Vocab Forge

Language-learning app: **Flutter** frontend (Riverpod + GoRouter) and a **Firebase Cloud Functions** (TypeScript) backend, with all data in **Firestore**.

- Firebase project: `vocab-forge-78557`
- Architecture overview: [ARCHITECTURE.md](ARCHITECTURE.md)
- Product context: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
- Deploying (TestFlight / functions / web): [DEPLOY.md](DEPLOY.md)

---

## Prerequisites

| Tool | Notes |
|------|-------|
| Flutter | Dart SDK `^3.11.0` (this repo builds on Flutter 3.41 / Dart 3.11) |
| Node.js | `functions/package.json` declares node 20; a newer local node works, the emulator just warns |
| Firebase CLI | `npm install -g firebase-tools`, then `firebase login` |
| gcloud (optional) | Only needed for the one-off scripts in `functions/src/scripts` and `functions/src/test` |

One-time setup:

```bash
flutter pub get                 # from repo root
cd functions && npm install     # backend deps
```

`functions/.env` must contain `GEMINI_API_KEY=...` — the AI client reads it via dotenv and the emulator loads it automatically. It is gitignored, so a fresh clone needs it created by hand.

---

## Running the backend (Cloud Functions)

All backend commands run from `functions/`.

```bash
cd functions
npm run serve      # tsc build + firebase emulators:start --only functions
```

That serves the callables at `http://127.0.0.1:5001/vocab-forge-78557/us-central1/<name>`, with the Emulator UI at <http://127.0.0.1:4000/>. Port **5001** is what the Flutter app expects in debug mode (see below).

Other useful scripts:

| Command | What it does |
|---------|--------------|
| `npm run build` | Compile TypeScript to `functions/lib/` |
| `npm run build:watch` | Same, in watch mode |
| `npm run lint` | ESLint over `functions/` (also runs as a predeploy step) |
| `npm run shell` | Build + `firebase functions:shell` for calling functions by hand |
| `npm run logs` | Tail deployed function logs |
| `npm run deploy` | `firebase deploy --only functions` |

### Important: only Functions are emulated

`npm run serve` starts the **Functions emulator only**. Auth and Firestore are **not** emulated, so local functions read and write **production Firestore** using your Application Default Credentials. The emulator prints a warning about this on startup — it is expected, but be careful with anything destructive.

The practical consequence is that the Firestore trigger `onAssignmentGenerationRequested` is **skipped locally** ("function ignored because the firestore emulator does not exist or is not running"). Question generation for Translation/Production will silently do nothing.

**Hybrid workflow (the usual one):** emulate the callables locally, but deploy the trigger so generation still runs in the cloud:

```bash
firebase deploy --only functions:onAssignmentGenerationRequested,firestore:rules
```

Deployed functions need `GEMINI_API_KEY` set in the cloud, not just in `functions/.env`. More detail in [`functions/src/assignments/sentence-practice/HOW_TRANSLATION_AND_PRODUCTION_WORK.md`](functions/src/assignments/sentence-practice/HOW_TRANSLATION_AND_PRODUCTION_WORK.md).

---

## Running the app (Flutter)

From the repo root:

```bash
flutter run -d chrome          # web
flutter run -d macos           # macOS desktop
flutter run                    # pick a connected device / simulator
flutter devices                # see what's available
```

**Debug builds automatically point Cloud Functions at the local emulator** (`lib/main.dart`): `127.0.0.1:5001`, or `10.0.2.2:5001` on the Android emulator. So start `npm run serve` first, or every callable will fail to connect.

Auth and Firestore always talk to production, in debug and release alike — only Functions are redirected.

To run against **deployed** functions instead, use a release/profile build:

```bash
flutter run --release -d chrome
```

Other frontend commands:

```bash
flutter analyze
flutter test
flutter clean && flutter pub get     # when the build gets weird
```

---

## Typical local dev loop

```bash
# terminal 1 — backend
cd functions && npm run serve

# terminal 2 — app
flutter run -d chrome
```

`npm run serve` does not hot-reload TypeScript; re-run it (or keep `npm run build:watch` alongside) after backend edits.

---

## Deploying

Short version — full walkthrough in [DEPLOY.md](DEPLOY.md).

| Target | Command |
|--------|---------|
| Cloud Functions | `firebase deploy --only functions` |
| A single function | `firebase deploy --only functions:<name>` |
| Firestore rules | `firebase deploy --only firestore:rules` |
| Firestore indexes | `firebase deploy --only firestore:indexes` |
| Web app | `flutter build web && firebase deploy --only hosting` |
| iOS / TestFlight | `flutter build ios --release`, then Xcode → Archive → Distribute |

Hosting serves `build/web`, so `flutter build web` must run before a hosting deploy. Function deploys run `npm run lint` and `npm run build` as predeploy steps, so a lint error blocks the deploy.

If the CLI can't find the project: `firebase use vocab-forge-78557`.

---

## One-off scripts

Maintenance and experiment scripts live in `functions/src/scripts/` and `functions/src/test/`. They are **not** deployed as Cloud Functions and they hit **production Firestore** via Application Default Credentials:

```bash
gcloud auth application-default login    # once
cd functions
```

Working npm shortcuts:

| Command | Script |
|---------|--------|
| `npm run anki:print-cards` | `src/scripts/printAnkiCards.ts` |
| `npm run migrate:vocab-cards-user-id` | `src/scripts/migrateVocabCardsUserId.ts` |
| `npm run migrate:student-vocab` | `src/scripts/migrateToStudentVocab.ts` |
| `npm run strip-html` | `src/scripts/cleanVocabHtml.ts` |
| `npm run test:gemini` | `src/test/testGemini.ts` |
| `npm run test:select-target-words -- <userId>` | `src/test/testSelectTargetWords.ts` |
| `npm run test:monte-carlo-words -- <userId> [--runs 7] [--trials 20] [--max-words 30]` | `src/test/monteCarloSelectTargetWords.ts` |
| `npm run test:benchmark-select-words -- <userId> [--iterations 5]` | `src/test/benchmarkSelectTargetWords.ts` |
| `npm run test:vocab-state-zero [-- <userId>]` | `src/test/listVocabCardsStateZero.ts` |

Two scripts run against the **Firestore emulator** instead of production and
need no credentials — they refuse to start without `FIRESTORE_EMULATOR_HOST`:

```bash
firebase emulators:start --only firestore --project demo-vocab-forge   # terminal 1
# terminal 2, from functions/
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-vocab-forge npm run test:vocab-assignment-flow
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-vocab-forge npm run test:no-vocab-guard-rails
```

They cover the persisted daily vocab assignment and the no-assigned-words guard
rails (see `functions/src/test/README.md`).

**Stale shortcuts:** `seed:vocab`, `seed:production`, `seed:translation`, and `seed:all-from-vocab` in `functions/package.json` point at paths that no longer exist (`src/scripts/seedVocab.ts` and a `src/seeding/` directory). The scripts themselves live in `functions/src/scripts/` (`seedData.ts`, `seedProduction.ts`, `seedTranslation.ts`, `seedAllFromVocabList.ts`) and can be run directly until the package.json paths are fixed:

```bash
npx ts-node --compilerOptions '{"module":"CommonJS","moduleResolution":"node"}' src/scripts/seedProduction.ts
```

Seeding scripts need `GEMINI_API_KEY` in `functions/.env` as well as Firebase credentials.

---

## Troubleshooting

- **Callables fail with connection refused in debug** — the Functions emulator isn't running. `cd functions && npm run serve`.
- **Questions never generate locally** — expected; `onAssignmentGenerationRequested` is a Firestore trigger and is ignored without the Firestore emulator. Deploy it (see hybrid workflow above).
- **`GEMINI_API_KEY is not set`** — create/populate `functions/.env` locally, or configure the key in the cloud for deployed functions.
- **Backend changes don't take effect** — `npm run serve` compiles once at startup; restart it or run `npm run build:watch`.
- **Web build fails** — `flutter clean && flutter pub get && flutter build web`.
