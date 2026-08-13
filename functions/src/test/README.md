# Local test scripts

One-off scripts for manual testing against Firestore / Gemini. Not deployed as Cloud Functions.

**Auth:** `gcloud auth application-default login` (or `GOOGLE_APPLICATION_CREDENTIALS`).

Run all commands from `functions/`.

| Script | npm command |
|--------|-------------|
| `testGemini.ts` | `npm run test:gemini` |
| `testSelectTargetWords.ts` | `npm run test:select-target-words -- <userId>` |
| `monteCarloSelectTargetWords.ts` | `npm run test:monte-carlo-words -- <userId> [--runs 7] [--trials 20] [--max-words 30]` |
| `benchmarkSelectTargetWords.ts` | `npm run test:benchmark-select-words -- <userId> [--iterations 5]` |
| `listVocabCardsStateZero.ts` | `npm run test:vocab-state-zero` (default uid) or `npm run test:vocab-state-zero -- <userId>` |

## Emulator-backed tests

Two scripts are different: they run entirely against the **Firestore emulator**
and refuse to start without `FIRESTORE_EMULATOR_HOST`, so they never touch
production. Neither calls Gemini.

| Script | Covers |
|--------|--------|
| `npm run test:vocab-assignment-flow` | The persisted daily vocab assignment end to end — wave creation, refresh/cold-start rehydration, "Again" re-queueing, mid-session progress, completion, the "Continue review" wave, and the three vocab callables. |
| `npm run test:no-vocab-guard-rails` | Students with no assigned words: enqueue reports the terminal `no_vocab` status instead of looping, repeat enqueues write nothing, vocab reports `deckIsEmpty`, sentence practice falls back to not-yet-due and recently-used words, and generation resumes once words appear. |

```bash
# terminal 1
firebase emulators:start --only firestore --project demo-vocab-forge

# terminal 2, from functions/
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-vocab-forge npm run test:vocab-assignment-flow
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-vocab-forge npm run test:no-vocab-guard-rails
```

Both exit non-zero if any check fails.

`monteCarloSelectTargetWords` calls `selectTargetWordsForSession` repeatedly with unchanged Firestore state to measure vocab overlap between simulated sessions (issue #51).
