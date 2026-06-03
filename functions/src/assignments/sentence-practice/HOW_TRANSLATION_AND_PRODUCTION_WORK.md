# How Translation & Production Work

Sentence-practice modes share one pipeline. Translation (Spanish → English) and Production (English → Spanish) differ only in prompts and the sentence field name; everything else is shared under `shared/`.

## End-to-end flow

```
Home / Session page
       │
       ▼
enqueueSessionGeneration          ← fast callable (~100ms), no AI
       │  flips the assignment's generationStatus → "generating"
       ▼
onAssignmentGenerationRequested   ← Firestore onWrite trigger (deployed),
       │                            fires on the transition into "generating"
       ▼
streamGenerateSessionQuestions    ← Gemini streaming, writes each question as a
       │                            doc under user_assignments/{id}/questions
       ▼
Flutter StreamProvider            ← listens to the assignment doc + its questions
                                     subcollection, shows Q1 as it arrives
```

## Word selection (`selectTargetWordsForSession`)

Generation picks up to 30 target words from the user's `vocab_cards` before
prompting Gemini. Selection (`shared/question-generation/trigger/helpers/selectTargetWordsForSession.ts`):

1. **Loads all** of the user's `vocab_cards` in one query and classifies each in
   memory the same way daily vocab does (`utils/vocabCardClassification.ts`:
   `learning` = state 1/3, `new` = state 0, `dueReview`/`notDueReview` = state 2
   split on end of the user's local day, `other` = unknown state).
2. **Excludes** words used in the user's recent sessions
   (`shared/question-generation/trigger/helpers/recentSentencePracticeWords.ts` reads the denormalized
   `vocabWordKeysUsed` summary on the last few `user_assignments` docs and
   matches it against each card's normalized `learningLanguageWord`), plus any
   explicit `excludeWordKeys`. This keeps consecutive sessions from reusing the
   same words/story without scanning each assignment's `questions` subcollection.
3. **Fills 30 slots by tier quota** in order — learning (6), weak (8: leech /
   hard / failure within 7d), due review (12), new (3), then a variety remainder
   (not-due review + other). Within each tier, cards are scored (FSRS-derived,
   minus a `stability` penalty) and **weighted-randomly sampled** from the top
   candidates so well-learned, far-future cards rarely appear and the same words
   don't dominate every run.

`timezoneOffsetMinutes` is captured at `enqueueSessionGeneration`, persisted on
the assignment doc, and read by the generation trigger so "due today" matches the
user's local day.

**Grading** is separate and runs in two phases, shared by both modes:

```
Submit answer
       │
       ▼
evaluateSentencePracticeResponse      ← phase 1 (blocking, MINIMAL thinking)
       │  score (omitted for skips) + corrected translation + segments
       │  persists aiEvaluation { explanationStatus: "generating" }
       ▼
client shows feedback screen immediately, then fires (unawaited):
       │
       ▼
generateSentencePracticeExplanation   ← phase 2 (background, MINIMAL thinking, streamed)
       │  streams each explanation bullet into aiEvaluation.explanations[]
       ▼
sets aiEvaluation { explanationStatus: "ready" } when the stream completes
       │
       ▼
Flutter session stream                ← explanation section fills in live
```

Both callables infer the mode (Translation/Production) from the assignment's
`type` and grade via the shared `evaluateDescriptions` / prompt builders on the
mode config. Skips never request a score.

## File map

### Shared core (`shared/core/`)

| File | Role |
|------|------|
| `assignmentRefs.ts` | Unified collection name (`user_assignments`) + `questions` subcollection helpers. |
| `sessionModes.ts` | Mode config: sentence field, generation + evaluation prompts/descriptions. `TRANSLATION_MODE` / `PRODUCTION_MODE`. |
| `streamingJsonArray.ts` | Parses complete JSON array elements from partial structured Gemini streams (questions + explanations). |

### Home status (`shared/home-status/`)

| File | Role |
|------|------|
| `dailySessionStatus.ts` | Today's completion-status lookup + continue-review wave creation (used by both `get*Session` / `prepare*ContinueReview`). **No AI.** |

### Question generation (`shared/question-generation/`)

Callable enqueues work; Firestore trigger runs the worker.

| Folder | Role |
|--------|------|
| `enqueue/` | Callable: flip `generationStatus` to `generating` (idempotent), return metadata immediately. |
| `trigger/` | Firestore `onWrite` when status enters `generating`; invokes the worker. |
| `trigger/helpers/` | Worker + vocab selection used only by the trigger. |

**`enqueue/`**

| File | Role |
|------|------|
| `enqueueSessionGeneration.ts` | `enqueueSessionGeneration` callable. |

**`trigger/`**

| File | Role |
|------|------|
| `onAssignmentGenerationRequested.ts` | Starts generation on `generationStatus` → `generating`. |

**`trigger/helpers/`**

| File | Role |
|------|------|
| `generateSessionQuestions.ts` | Gemini stream → `questions/{index}`; sets parent `ready` / `failed` + `vocabWordKeysUsed`. |
| `selectTargetWordsForSession.ts` | Picks vocab targets for the batch. |
| `recentSentencePracticeWords.ts` | Excludes words from recent assignments. |

### Answer feedback (`shared/answer-feedback/`) — AI response to a submitted answer

| Folder | Role |
|--------|------|
| `evaluate/` | Phase 1 (blocking): score, corrected translation, persist answer, advance assignment progress. |
| `explanation/` | Phase 2 (background, streamed): teaching bullets after phase 1 returns. |

**`evaluate/`**

| File | Role |
|------|------|
| `evaluateSentencePracticeResponse.ts` | Phase 1 callable: score + corrected translation. |
| `persistEvaluatedQuestion.ts` | Writes `studentAnswer` + phase-1 `aiEvaluation`; updates parent `averageScorePercent`. |
| `assignmentProgress.ts` | Increments `completedQuestionCount`; marks assignment `COMPLETED` when the wave is done. |

**`explanation/`**

| File | Role |
|------|------|
| `generateSentencePracticeExplanation.ts` | Phase 2 callable: streams teaching bullets, appends each to the question, then sets `ready`. |
| `persistExplanationUpdates.ts` | Merge/append helpers for `aiEvaluation.explanations` while streaming. |

### Per mode (`sentence-practice/translation/`, `sentence-practice/production/`)

| File | Role |
|------|------|
| `get*Session.ts` | Home stub lookup only. Creates empty todo if needed. **No AI.** |
| `prepare*ContinueReview.ts` | Creates wave-2 todo after 10/10. **No AI.** |
| `prompts.ts` | Mode-specific generation and evaluation prompt text (phase 1 grade, skip, phase 2 explain). |

Answer feedback lives in `shared/answer-feedback/` (`evaluate/` + `explanation/`); there are no per-mode `evaluate*Response.ts` files.

## Firestore docs

Single unified collection (issue #58): `user_assignments/{assignmentId}` with a
`questions` subcollection. Completing a wave is an in-place update (no copy/move).

**`user_assignments/{assignmentId}`** — assignment + progress + generation lifecycle

- `userId`, `type`: `TRANSLATION` | `PRODUCTION`, `teacher`, `assignmentDate`, `createdAt`
- `completionStatus`: `TODO` | `COMPLETED` (active vs done); `completedAt` set on completion
- `generationStatus`: `none` | `generating` | `ready` | `failed` (+ `generationError`)
- `completedQuestionCount`, `totalQuestionCount`, `cumulativeOffsetQuestionCount`
- `averageScorePercent` — running mean of answered `aiEvaluation.score` (from `scoreSum` / `scoredQuestionCount`); `null` until the first scored answer
- `vocabWordKeysUsed` — denormalized normalized word keys for recent-words exclusion
- `timezoneOffsetMinutes` — captured at enqueue for "due today" word selection

**`user_assignments/{assignmentId}/questions/{index}`** — one doc per question

- `userId` (denormalized for rules), `index`, the mode's sentence field, `vocabWordsUsed`
- `studentAnswer` — set on grade; `"(skipped)"` for skips
- `aiEvaluation` — `{ score, correctedVersion, correctedVersionSegments, explanations, explanationStatus }`. Phase 1 sets score/corrected with `explanations: []` and `explanationStatus: "generating"`; phase 2 appends each explanation bullet as it streams, then sets `explanationStatus` to `ready` (or `failed`).

## Client triggers for generation

1. **Session page open** — stream provider calls `enqueueSessionGeneration`.
2. **Home dwell (6s)** — prefetch for TODO modes with 0 progress (fire-and-forget enqueue).

Both are idempotent: a second call returns the existing in-flight or ready set.

## Local dev note

`npm run serve` starts **Functions only**. Firestore triggers are ignored locally unless the Firestore emulator is also running.

**Hybrid workflow (common):** emulate callables locally against prod Firestore; **deploy** `onAssignmentGenerationRequested` so generation runs in the cloud when enqueue flips `generationStatus`.

```bash
firebase deploy --only functions:onAssignmentGenerationRequested,firestore:rules
```

Deployed triggers need `GEMINI_API_KEY` configured in the cloud, not only in `functions/.env`.
