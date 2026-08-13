/**
 * Lifecycle of a sentence-practice assignment's question generation, stored as
 * `generationStatus` on the assignment doc.
 *
 * - `none`      — nothing requested yet.
 * - `generating`— a worker is streaming questions in.
 * - `ready`     — questions are complete.
 * - `failed`    — something went wrong (AI error, no questions parsed). Retryable:
 *                 the next enqueue flips it back to `generating`.
 * - `no_vocab`  — the student has no vocab words to practise. **Terminal**: no
 *                 amount of retrying can produce questions, so enqueue must not
 *                 re-trigger generation, and the client shows a friendly
 *                 "your tutor hasn't added words yet" state instead of an error.
 *                 Cleared automatically once words exist (enqueue re-checks the
 *                 deck on every call).
 */
export type GenerationStatus = "none" | "generating" | "ready" | "failed" | typeof NO_VOCAB_STATUS;

export const NO_VOCAB_STATUS = "no_vocab";
