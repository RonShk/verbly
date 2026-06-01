# Local test scripts

One-off scripts for manual testing against Firestore / Gemini. Not deployed as Cloud Functions.

**Auth:** `gcloud auth application-default login` (or `GOOGLE_APPLICATION_CREDENTIALS`).

Run all commands from `functions/`.

| Script | npm command |
|--------|-------------|
| `testGemini.ts` | `npm run test:gemini` |
| `testSelectTargetWords.ts` | `npm run test:select-target-words -- <userId>` |
| `monteCarloSelectTargetWords.ts` | `npm run test:monte-carlo-words -- <userId> [--runs 7] [--trials 20] [--max-words 30]` |
| `listVocabCardsStateZero.ts` | `npm run test:vocab-state-zero` (default uid) or `npm run test:vocab-state-zero -- <userId>` |

`monteCarloSelectTargetWords` calls `selectTargetWordsForSession` repeatedly with unchanged Firestore state to measure vocab overlap between simulated sessions (issue #51).
