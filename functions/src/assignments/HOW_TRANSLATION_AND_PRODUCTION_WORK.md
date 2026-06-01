# How Translation & Production Work

Sentence-practice modes share one pipeline. Translation (Spanish → English) and Production (English → Spanish) differ only in prompts and the sentence field name; everything else is shared under `shared/`.

## End-to-end flow

```
Home / Session page
       │
       ▼
enqueueSessionGeneration          ← fast callable (~100ms), no AI
       │  creates empty question set doc (status: "generating")
       ▼
onTranslationQuestionSetCreated   ← Firestore onCreate trigger (deployed)
onProductionQuestionSetCreated
       │
       ▼
streamGenerateSessionQuestions    ← Gemini streaming, appends questions to Firestore
       │
       ▼
Flutter StreamProvider            ← listens to question set doc, shows Q1 as it arrives
```

## Word selection (`selectTargetWordsForSession`)

Generation picks up to 30 target words from the user's `vocab_cards` before
prompting Gemini. Selection (`functions/src/utils/selectTargetWordsForSession.ts`):

1. **Loads all** of the user's `vocab_cards` in one query and classifies each in
   memory the same way daily vocab does (`utils/vocabCardClassification.ts`:
   `learning` = state 1/3, `new` = state 0, `dueReview`/`notDueReview` = state 2
   split on end of the user's local day, `other` = unknown state).
2. **Excludes** words used in the user's recent translation/production sessions
   (`utils/recentSentencePracticeWords.ts` reads the last few question sets per
   collection and matches `questions[].vocabWordsUsed` against each card's
   normalized `learningLanguageWord`), plus any explicit `excludeWordKeys`. This
   is what keeps consecutive sessions from reusing the same words/story.
3. **Fills 30 slots by tier quota** in order — learning (6), weak (8: leech /
   hard / failure within 7d), due review (12), new (3), then a variety remainder
   (not-due review + other). Within each tier, cards are scored (FSRS-derived,
   minus a `stability` penalty) and **weighted-randomly sampled** from the top
   candidates so well-learned, far-future cards rarely appear and the same words
   don't dominate every run.

`timezoneOffsetMinutes` is captured at `enqueueSessionGeneration`, persisted on
the question set doc, and read by the onCreate trigger so "due today" matches the
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

### Shared (`shared/`)

| File | Role |
|------|------|
| `sessionModes.ts` | Mode config: collection name, sentence field, generation + evaluation prompts/descriptions. `TRANSLATION_MODE` / `PRODUCTION_MODE`. |
| `enqueueSessionGeneration.ts` | Callable: create or reuse question set, return `questionSetId` immediately. |
| `onQuestionSetCreated.ts` | Firestore triggers that start generation when a `generating` doc is created. |
| `generateSessionQuestions.ts` | Worker: vocab selection → Gemini stream → append each question to Firestore. |
| `streamingJsonArray.ts` | Parses complete question objects from partial structured JSON stream. |
| `persistEvaluatedQuestion.ts` | Transactional single-question writes during grading: `persistEvaluatedQuestion` (phase 1) and `mergeQuestionEvaluation` (phase 2 merge). Safe while generation still appends. |
| `evaluateSentencePracticeResponse.ts` | Phase 1 grading callable: score + corrected translation. |
| `generateSentencePracticeExplanation.ts` | Phase 2 callable: streams teaching bullets via `StreamingJsonArrayExtractor`, appends each to the question, then sets `ready`. |

### Per mode (`translation/`, `production/`)

| File | Role |
|------|------|
| `get*Session.ts` | Home stub lookup only. Creates empty todo if needed. **No AI.** |
| `prepare*ContinueReview.ts` | Creates wave-2 todo after 10/10. **No AI.** |
| `prompts.ts` | Mode-specific generation and evaluation prompt text (phase 1 grade, skip, phase 2 explain). |

Grading itself lives in `shared/` (`evaluateSentencePracticeResponse.ts`, `generateSentencePracticeExplanation.ts`); there are no longer per-mode `evaluate*Response.ts` files.

## Firestore docs

**`user_todo_assignments/{id}`** — assignment stub / progress

- `type`: `TRANSLATION` | `PRODUCTION`
- `questionSetId` — set after enqueue
- `generationStatus`: `generating` | `ready` | `failed`
- `completedQuestionCount`, `totalQuestionCount`, `cumulativeOffsetQuestionCount`

**`translation_question_sets/{id}`** / **`production_question_sets/{id}`**

- `status`: `generating` | `ready` | `failed`
- `questions[]` — grows incrementally during generation
- `questions[i].aiEvaluation` — written during grading: `{ score, correctedVersion, correctedVersionSegments, explanations, explanationStatus }`. Phase 1 sets score/corrected with `explanations: []` and `explanationStatus: "generating"`; phase 2 appends each explanation bullet as it streams, then sets `explanationStatus` to `ready` (or `failed`).
- `userId`, `assignmentId`

## Client triggers for generation

1. **Session page open** — stream provider calls `enqueueSessionGeneration`.
2. **Home dwell (6s)** — prefetch for TODO modes with 0 progress (fire-and-forget enqueue).

Both are idempotent: a second call returns the existing in-flight or ready set.

## Local dev note

`npm run serve` starts **Functions only**. Firestore triggers are ignored locally unless the Firestore emulator is also running.

**Hybrid workflow (common):** emulate callables locally against prod Firestore; **deploy** `onTranslationQuestionSetCreated` and `onProductionQuestionSetCreated` so generation runs in the cloud when enqueue creates a doc.

```bash
firebase deploy --only functions:onTranslationQuestionSetCreated,functions:onProductionQuestionSetCreated,firestore:rules
```

Deployed triggers need `GEMINI_API_KEY` configured in the cloud, not only in `functions/.env`.
