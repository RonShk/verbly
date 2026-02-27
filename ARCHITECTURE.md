# Vocab Forge Architecture

## Overview

Vocab Forge is a language-learning app built with a **Flutter** frontend and a **Firebase Cloud Functions** (TypeScript) backend. The frontend uses **Riverpod** for state management and **GoRouter** for navigation. All data lives in **Firestore**.

---

## Frontend (`lib/`)

```
lib/
├── main.dart                     # App entry, Firebase init, GoRouter config
├── firebase_options.dart         # Auto-generated Firebase config
├── constants/
│   └── demo_user.dart            # Hardcoded demo user ID (placeholder until auth)
├── models/
│   ├── home_page_models.dart     # Models for the home page API response
│   └── vocab_session_models.dart # Models for the vocab session API response
├── services/
│   ├── home_page_api_calls.dart        # API calls for the home page
│   └── vocab_session_api_calls.dart    # API calls for the vocab session
├── providers/
│   ├── home_page_provider.dart   # Riverpod provider that exposes HomePageData
│   └── vocab_session_provider.dart # Riverpod provider that exposes VocabSessionData
├── pages/
│   ├── home_page.dart            # Weekly assignments list, progress, completed
│   ├── profile_page.dart         # Profile stub
│   └── vocab_session_page.dart   # Flashcard session UI (flip card, next card)
├── widgets/
│   └── navbar.dart               # Bottom nav bar shell (Home, Profile)
└── theme/
    └── app_colors.dart           # Centralized color palette
```

### How the layers connect

```
Page (UI) → watches Provider → calls Service → Firebase Cloud Function → Firestore
```

#### Services (`lib/services/`)

Services are **thin API wrappers**. Each function in a service file:
1. Creates an `httpsCallable` reference to a specific Cloud Function by name.
2. Passes the required parameters (e.g. `userId`, `assignmentId`).
3. Parses the raw response into a typed Dart model.

Services contain **no business logic and no state**. They are pure async functions that translate between the Cloud Functions wire format and typed Dart objects.

| File | Functions | Calls |
|------|-----------|-------|
| `home_page_api_calls.dart` | `getHomePageData()` | `getHomePageData` Cloud Function |
| `vocab_session_api_calls.dart` | `getVocabSession()`, `recordVocabResponse()` | `getVocabSession`, `recordVocabResponse` Cloud Functions |

#### Providers (`lib/providers/`)

Providers are **Riverpod state holders**. They sit between the UI and the services:
1. Call a service function to fetch data.
2. Expose the result as an `AsyncValue` (loading / error / data).
3. Auto-dispose when no widget is watching, so stale data is cleaned up.

Pages `ref.watch()` a provider to reactively rebuild when data changes, and `ref.invalidate()` to trigger a re-fetch (e.g. after recording a response).

| File | Provider | Type |
|------|----------|------|
| `home_page_provider.dart` | `homePageDataProvider` | `FutureProvider<HomePageData>` |
| `vocab_session_provider.dart` | `vocabSessionProvider` | `FutureProvider.family<VocabSessionData, String>` (keyed by assignmentId) |

#### Models (`lib/models/`)

Plain Dart classes with `fromJson` factories. One model file per feature/screen. No logic beyond deserialization.

#### Pages (`lib/pages/`)

Stateful or stateless widgets that compose the UI. Each page watches its corresponding provider and renders loading / error / data states. Pages call service functions directly for mutations (e.g. `recordVocabResponse`) and then invalidate providers to refresh.

#### Routing

GoRouter in `main.dart`. The bottom navbar (`MainShell`) wraps `/home` and `/profile` via a `ShellRoute`. Assignment sessions (`/assignment/:id`) are top-level routes **outside** the shell, so the navbar is hidden during a session.

---

## Backend (`functions/src/`)

```
functions/src/
├── index.ts                           # Firebase init, exports all callables
├── seedData.ts                        # Seeds demo assignments (run manually)
├── seedVocab.ts                       # Seeds vocab_lists + links VOCAB assignment
├── home/
│   └── getHomePageData.ts             # Returns weekly assignments & completed
└── assignments/
    └── vocab/
        ├── getVocabSession.ts         # Returns shuffled vocab questions for an assignment
        └── recordVocabResponse.ts     # Records progress, moves to completed when done
```

### How it's organized

- **`index.ts`** initializes Firebase Admin once and re-exports every callable. This is the only file Firebase deploys as the entry point.
- **`home/`** contains callables related to the home page.
- **`assignments/`** is split by assignment type. Currently only `vocab/` exists. Future types (reading_vocab, translation, production) will each get their own subfolder with their own get-session and record-response callables.
- **`seed*.ts`** are standalone scripts (not deployed as callables) for populating Firestore with demo data.

### Callables

| Function | Location | Purpose |
|----------|----------|---------|
| `getHomePageData` | `home/getHomePageData.ts` | Queries `user_todo_assignments` and `user_completed_assignments` for the current week; returns summary, assignment cards, and completed items. |
| `getVocabSession` | `assignments/vocab/getVocabSession.ts` | Loads the assignment's linked `vocab_lists` doc, shuffles words, returns the question list and progress counts. |
| `recordVocabResponse` | `assignments/vocab/recordVocabResponse.ts` | Increments `completedQuestionCount`. When all questions are done, moves the assignment from `user_todo_assignments` to `user_completed_assignments` in a transaction. |

---

## Firestore Collections

| Collection | Purpose | Key fields |
|------------|---------|------------|
| `vocab_lists` | Teacher-provided word pairs per user | `userId`, `learningLanguage`, `words[]`, `weekStart` |
| `user_todo_assignments` | Active assignments for the current week | `userId`, `type`, `teacher`, `dueDate`, `vocabListId`, `totalQuestionCount`, `completedQuestionCount` |
| `user_completed_assignments` | Finished assignments | `userId`, `type`, `teacher`, `dueDate`, `totalQuestionCount`, `completedAt` |

---

## Data Flow

```
┌─────────────┐         ┌──────────────┐         ┌────────────┐
│  Flutter UI  │  watch  │   Riverpod   │  call   │  Service   │
│  (Page)      │ ──────► │  Provider    │ ──────► │  (API fn)  │
└─────────────┘         └──────────────┘         └─────┬──────┘
                                                       │ httpsCallable
                                                       ▼
                                                 ┌────────────┐
                                                 │  Cloud Fn   │
                                                 │  (TS)       │
                                                 └─────┬──────┘
                                                       │ read/write
                                                       ▼
                                                 ┌────────────┐
                                                 │  Firestore  │
                                                 └────────────┘
```

1. **Page** watches a **Provider** → gets `AsyncValue` (loading/error/data).
2. **Provider** calls a **Service** function on first watch.
3. **Service** fires an `httpsCallable` to a **Cloud Function**.
4. **Cloud Function** reads/writes **Firestore** and returns JSON.
5. **Service** parses JSON into a typed **Model** and hands it back up the chain.
6. For mutations (e.g. "Next Card"), the **Page** calls the service directly, checks the result, then invalidates the provider to trigger a re-fetch.
