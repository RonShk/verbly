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

**Grading** is separate: `evaluateTranslationResponse` / `evaluateProductionResponse` run one blocking Gemini call per submitted answer.

## File map

### Shared (`shared/`)

| File | Role |
|------|------|
| `sessionModes.ts` | Mode config: collection name, sentence field, prompts. `TRANSLATION_MODE` / `PRODUCTION_MODE`. |
| `enqueueSessionGeneration.ts` | Callable: create or reuse question set, return `questionSetId` immediately. |
| `onQuestionSetCreated.ts` | Firestore triggers that start generation when a `generating` doc is created. |
| `generateSessionQuestions.ts` | Worker: vocab selection → Gemini stream → append each question to Firestore. |
| `streamingJsonArray.ts` | Parses complete question objects from partial structured JSON stream. |
| `persistEvaluatedQuestion.ts` | Transactional single-question update during grading (safe while generation still appends). |

### Per mode (`translation/`, `production/`)

| File | Role |
|------|------|
| `get*Session.ts` | Home stub lookup only. Creates empty todo if needed. **No AI.** |
| `prepare*ContinueReview.ts` | Creates wave-2 todo after 10/10. **No AI.** |
| `evaluate*Response.ts` | Grades one answer via `generateStructured`. |
| `prompts.ts` | Mode-specific generation and evaluation prompt text. |

## Firestore docs

**`user_todo_assignments/{id}`** — assignment stub / progress

- `type`: `TRANSLATION` | `PRODUCTION`
- `questionSetId` — set after enqueue
- `generationStatus`: `generating` | `ready` | `failed`
- `completedQuestionCount`, `totalQuestionCount`, `cumulativeOffsetQuestionCount`

**`translation_question_sets/{id}`** / **`production_question_sets/{id}`**

- `status`: `generating` | `ready` | `failed`
- `questions[]` — grows incrementally during generation
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
