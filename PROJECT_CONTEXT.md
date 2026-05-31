# Verbly — Project context (teacher / tutor platform)

**Who should read this:** You are building **`verbly_teacher`** (name TBD) — the web dashboard for **tutors** (private teachers, language coaches, small tutoring businesses) who manage **many students** from one place. You likely have **no prior context** on Verbly. This document explains the product, how tutors fit in, how students practice, and what already exists on the backend so you can integrate cleanly.

**Firebase project (shared):** `vocab-forge-78557`  
**Firebase / student repo naming note:** The Firebase project and current student repo are still named `vocab_forge`. That’s fine for now and can be renamed later.  
**Student mobile app repo:** `vocab_forge` (Flutter — already built, not your main job)  
**Your repo:** `verbly_teacher` (you are creating this). **The only stack decision locked in today is Next.js** — version, router patterns, auth libraries, UI kit, and hosting may change as the tutor site is built.

---

## What is Verbly?

Verbly is a **language-learning practice platform**. A student opens a mobile app and works through **daily practice** in three complementary modes: vocabulary flashcards, written production (active recall in the target language), and translation (comprehension into their comfortable language). An independent **tutor** uses a **web dashboard** to see who is on their roster, assign or upload vocabulary, and eventually review progress and results.

The product is **multi-language by design**. We are **launching with Spanish as the language being learned** and **English as the language the student already knows**, but nothing in the long-term vision is “Spanish only.” Field names in the database still say things like `englishWord` for historical reasons; that really means “word in the known language,” not “English forever.”

Think of it as **two clients, one brain:**

| Client | Who | What they do |
|--------|-----|----------------|
| **Student app** (Flutter) | Learners | Sign in, do daily VOCAB / PRODUCTION / TRANSLATION practice |
| **Tutor dashboard** (Next.js — **your work**) | Tutors | Sign in, manage roster, link students, manage vocab & view progress |

Both talk to the **same Firebase project**: same Authentication users (different roles in practice), same Firestore database. The student app does **not** embed tutor features; the tutor site does **not** ship the student UI. That split is intentional.

---

## Who is the “teacher”?

In this codebase we say **teacher** or **tutor** interchangeably. The product is aimed at **tutors who manage multiple students** — not a single classroom LMS with 200 seats, but a coach who needs:

- A **roster** (“my students”)
- Per-student **vocabulary** they control
- Later: **progress and grades** across the three practice modes

The tutor dashboard is the **operational home** for that workflow. Students discover content and do reps in the app; tutors orchestrate **who** is on their roster and **what words** those students are working on.

---

## The three practice modes (what students actually do)

Students see three cards on their home screen, always in this order: **VOCAB → PRODUCTION → TRANSLATION**. Understanding these modes matters for the tutor product because tutors care about **words** (feeds all three) and **outcomes** (completion, scores, streaks).

### 1. VOCAB — spaced-repetition flashcards (FSRS)

**What it feels like:** Classic flashcards. Show a word (or prompt), student reveals the answer, rates how well they knew it: Again / Hard / Good / Easy.

**What powers it:** Each word pair lives in Firestore as a document in **`vocab_cards`**. Scheduling uses **FSRS** (Free Spaced Repetition Scheduler), implemented with the `ts-fsrs` library in Cloud Functions. Each card stores FSRS state: `due`, `stability`, `difficulty`, `state` (new / learning / review / relearning), etc. When the student rates a card, a callable function updates that document and computes the next review time.

**Why tutors care:** This is the **canonical word list** for a student. Words the tutor adds (via the dashboard) should land in `vocab_cards` with the student’s `userId`. VOCAB sessions pull from this pool (due reviews + a capped number of new cards per day). Translation and Production also **sample target words** from the same pool when generating AI exercises.

**Technical note:** VOCAB “daily assignment” is largely driven by what’s due in `vocab_cards`, not a heavy assignment document. The app uses a synthetic id like `daily-vocab` on the client.

### 2. PRODUCTION — write in the learning language

**What it feels like:** The student sees a sentence in their **known language** (English in the MVP) and types a translation in the **learning language** (Spanish in the MVP). Think “output” practice — they must produce the target language.

**What powers it:** A daily **assignment** row in `user_todo_assignments` with `type: "PRODUCTION"`. On first real session start, Cloud Functions call **Gemini** to generate a set of prompts stored in **`production_question_sets`**. Each answer is graded by the shared two-phase pipeline: **`evaluateSentencePracticeResponse`** scores the answer (0–100) and returns corrected text with highlights (advancing assignment progress), then **`generateSentencePracticeExplanation`** fills in the teaching explanations in the background. When the day’s set is finished, the assignment moves to **`user_completed_assignments`**.

**Why tutors care:** Production shows whether the student can **use** vocabulary in context, not just recognize it. Tutors will eventually want to see scores and weak patterns; that data lives on assignment / evaluation paths written by student functions today.

### 3. TRANSLATION — understand the learning language

**What it feels like:** The opposite direction from Production. The student sees a sentence in the **learning language** and types the meaning in the **known language**.

**What powers it:** Same pattern as Production: `user_todo_assignments` with `type: "TRANSLATION"`, questions in **`translation_question_sets`**, grading via the shared **`evaluateSentencePracticeResponse`** / **`generateSentencePracticeExplanation`** pipeline and Gemini.

**Why tutors care:** Translation stresses **comprehension** and nuance. Together with Production, it rounds out active vs receptive skills while VOCAB builds the underlying word memory.

### How the three modes relate

```text
                    ┌─────────────────────────────────────┐
                    │  vocab_cards (word pairs + FSRS)     │
                    │  Tutor adds/edits via dashboard      │
                    └──────────────┬──────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼                       ▼
      ┌─────────┐           ┌─────────────┐         ┌──────────────┐
      │  VOCAB  │           │ PRODUCTION  │         │ TRANSLATION  │
      │  FSRS   │           │ known →     │         │ learning →   │
      │  drills │           │  learning   │         │   known      │
      └─────────┘           └─────────────┘         └──────────────┘
           │                       │                       │
           └───────────────────────┴───────────────────────┘
                          Student Flutter app
                          (Cloud Functions + Gemini)
```

**Continue review:** After finishing a daily batch, students can start another “wave” the same day. VOCAB handles extra waves mostly on the client; Translation/Production create additional todo documents with special flags so the home screen stays sane. You do not need to implement Continue Review in the tutor dashboard for MVP, but tutors may ask why a student did “16/15” questions — that’s cumulative waves across the day.

---

## The tutor dashboard (what you are building)

### Purpose

A **logged-in tutor** opens the site and:

1. Sees **their students** (roster)
2. **Links** a student (connects their Firebase Auth account to this tutor)
3. Opens a **student detail** view
4. **Manages vocabulary** for that student (create/edit `vocab_cards`, optionally lists)
5. Later: views **progress and grades** from assignments and AI evaluations

This is a **multi-student control panel**, not a student-facing study app.

### Stack (not definitive — Next.js only is fixed)

**Committed today:** the tutor dashboard will be a **Next.js** web app.

**Everything else below is current thinking**, not a contract. We may add or remove libraries, change how auth is wired, swap UI frameworks, or adjust folder layout. When in doubt, match what’s already in `verbly_teacher` if the repo exists, or choose sensible defaults and document what you picked.

| Piece | Current direction (may change) |
|-------|--------------------------------|
| Framework | **Next.js** (likely v16+; App Router is the modern default) |
| Routing | **`app/`** directory — not legacy `pages/` |
| APIs | **Route Handlers** under `app/api/.../route.ts` — not `pages/api` |
| Auth (browser) | Likely Firebase Auth client SDK (Google / email) |
| Auth (server) | Likely verify Firebase **ID token** + **`firebase-admin`** |
| Database | Same Firestore project `vocab-forge-78557` (integration assumption; access pattern TBD) |

**If you use Next.js 16 with the App Router, typical patterns look like this:**

- New routes live under `app/`, e.g. `app/students/page.tsx`, `app/students/[studentUid]/vocab/page.tsx`.
- HTTP endpoints live under `app/api/`, e.g. `app/api/students/route.ts` exporting `GET`, `POST`, etc.
- Use **Server Components** where you fetch with Admin SDK and do not need client interactivity; use **Client Components** (`"use client"`) for login UI and interactive forms.
- Node **20.9+** is required for Next 16.
- You may see `proxy.ts` in Next 16 docs (evolution of middleware); use current Next docs when scaffolding — do not assume a Pages Router `pages/api` layout.

**Example dependencies (optional, not required):** `next`, `react`, `firebase`, `firebase-admin`, plus whatever auth/UI stack the team chooses later.

### Example app structure (illustrative — adjust freely)

```text
verbly_teacher/
  app/
    layout.tsx
    page.tsx                    # redirect or marketing → /students
    login/page.tsx
    students/
      page.tsx                  # roster table
      [studentUid]/
        page.tsx                # student hub
        vocab/page.tsx          # vocab editor
    api/
      auth/
        me/route.ts             # GET current tutor profile
        bootstrap/route.ts      # POST create teachers/{uid}
      students/
        route.ts                # GET list roster
        link/route.ts           # POST link student (two-way write)
        [studentUid]/route.ts   # DELETE unlink
        [studentUid]/vocab/route.ts   # GET/POST vocab_cards
        [studentUid]/progress/route.ts  # GET (later)
  lib/
    firebase/
      client.ts                 # browser Firebase app
      admin.ts                  # singleton admin
    server/
      verifyAuth.ts             # Bearer token → uid
      assertTutorOwnsStudent.ts
    types/
      firestore.ts              # TeacherDoc, StudentDoc, RosterStudentDoc
```

---

## How tutors connect to students (critical)

There is **no** generic `users` collection. Identity is split:

| Document | Meaning |
|----------|---------|
| `teachers/{tutorUid}` | Tutor profile (doc id = tutor’s Firebase Auth uid) |
| `students/{studentUid}` | Student profile (doc id = student’s Auth uid) |
| `teachers/{tutorUid}/students/{studentUid}` | **Roster row** — this student appears on this tutor’s dashboard |

When a student signs up in the mobile app, a Cloud Function already creates **`students/{uid}`** with `teacherId: null`. They can practice; they are **not** on any tutor’s roster until linked.

**Linking a student (you must do both in one transaction):**

1. Set `students/{studentUid}.teacherId = tutorUid`
2. Create or update `teachers/{tutorUid}/students/{studentUid}` (display name, email, `displayNameLower` for search, `removedAt: null`)

**Unlinking:**

1. Soft-remove roster row (`removedAt` timestamp) or delete it
2. Clear `students/{studentUid}.teacherId`

**Listing students for the dashboard:** Query **`teachers/{myUid}/students`**, not “all students in the database.”

```text
   Tutor signs in                    Student signs up (app)
         │                                    │
         ▼                                    ▼
  teachers/{tutorUid}                  students/{studentUid}
         │                              teacherId: null
         │                                    │
         └────────── link (your API) ───────┘
                    │
                    ▼
     teachers/{tutorUid}/students/{studentUid}
     students/{studentUid}.teacherId = tutorUid
```

**MVP linking:** You may start with “tutor enters student uid” or pick from a list if you build invite later. Invite flows are **out of scope** for now.

---

## Student app — status for integration (brief)

The Flutter student app in **`vocab_forge`** is **built and ready for integration** with the platform you are implementing. You do not need to rebuild student flows.

What already works on the student side:

- Real Firebase Auth (e.g. Google sign-in); all practice uses `auth.uid`
- `students/{uid}` auto-created on signup
- Full VOCAB / PRODUCTION / TRANSLATION pipelines via Cloud Functions
- Learning data in Firestore keyed by **`userId`** (= student uid)

What the student app **does not** do (your job):

- Tutor login, roster UI, linking, bulk vocab upload from the web
- Any write to `teachers/**` (Firestore rules block client access there)

Student Cloud Functions live only in `vocab_forge/functions`. **Do not add tutor APIs there.** Tutor writes go through your Next.js Route Handlers + Admin SDK.



---

## Data you will read and write (tutor-relevant)

### Tutor-owned paths (Admin SDK from your API)

**`teachers/{tutorUid}`** — created on first login (bootstrap)

```json
{
  "displayName": "Elena Vance",
  "email": "elena@example.com",
  "createdAt": "<timestamp>"
}
```

**`teachers/{tutorUid}/students/{studentUid}`** — roster

```json
{
  "displayName": "Maria Lopez",
  "displayNameLower": "maria lopez",
  "email": "maria@example.com",
  "phone": "+1 555 0100",
  "createdAt": "<timestamp>",
  "removedAt": null
}
```

**`students/{studentUid}`** — you update `teacherId` when linking; student created at signup

```json
{
  "displayName": "Maria Lopez",
  "email": "maria@example.com",
  "teacherId": "<tutorUid or null>",
  "createdAt": "<timestamp>"
}
```

### Student learning data (Admin SDK after `assertTutorOwnsStudent`)

All keyed by **`userId`** = student’s Auth uid. **Not** nested under `teachers/...`.

| Collection | Tutor use |
|------------|-----------|
| **`vocab_cards`** | Primary vocab CRUD — word in learning language + word in known language + FSRS fields for new cards |
| **`vocab_lists`** | Optional batch uploads (legacy); has `learningLanguage` e.g. `"es"` |
| **`user_todo_assignments`** | Read progress — active daily work |
| **`user_completed_assignments`** | Read history — completed dailies |
| **`translation_question_sets` / `production_question_sets`** | Read-only insight into AI-generated content (students cannot access directly either) |

Before any student data API: **`assertTutorOwnsStudent(tutorUid, studentUid)`** — roster doc exists, not removed, and `students/{studentUid}.teacherId === tutorUid`.

### Naming trap

Assignment documents have a string field **`teacher`** (e.g. `"Dr. Aris Thorne"`). That is a **display label on the homework card** in the student app. It is **unrelated** to the Firestore collection **`teachers/{uid}`**. Do not confuse them in code or UI copy.

---

## Security model (why everything goes through your API)

`firestore.rules` in `vocab_forge`:

- Students can read/write their own learning docs (`userId` match) and their own `students/{uid}` profile.
- **`teachers/**` is denied to all clients** — browsers cannot read or write tutor trees directly.
- Tutor operations **must** use **`firebase-admin`** on the server after verifying the tutor’s ID token.

Pattern for Route Handlers:

```text
Request → Authorization: Bearer <Firebase ID token>
       → admin.auth().verifyIdToken(token) → tutorUid
       → assertTutorOwnsStudent(tutorUid, studentUid)  [when acting on a student]
       → admin.firestore() read/write
```

Never expose service account JSON to the client.

---


## Firebase essentials

| Item | Value |
|------|--------|
| Project ID | `vocab-forge-78557` |
| Firestore | `(default)`, region `nam5` |
| Auth | Email/password + Google enabled |
| Rules / indexes | Maintained in **`vocab_forge`** repo (`firestore.rules`, `firestore.indexes.json`) — deploy from there when schema changes |

Student repo deploys Cloud Functions (practice + `onAuthUserCreated`). Teacher site deploys separately (Vercel, Firebase Hosting, etc.) but uses the **same** Firebase project config.


## Copy this doc

When you create **`verbly_teacher`**, copy **`PROJECT_CONTEXT.md`** into that repo (root or `docs/`) so every new chat has the same product picture. Update this file if the tutor workflow or schema changes.

---

*End of document.*
