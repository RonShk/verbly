import * as admin from "firebase-admin";
import {type DocumentReference} from "firebase-admin/firestore";

const db = admin.firestore();

/**
 * Atomically records a student's answer + AI evaluation onto a single question
 * within a question set, without clobbering other questions.
 *
 * This must be transactional: a question set may still be receiving streamed
 * questions (appended via arrayUnion by the generation worker) at the same time
 * the student answers an earlier one. A naive full-array rewrite would race
 * with those appends and drop not-yet-answered questions. The transaction
 * re-reads the latest array and mutates only the target index.
 */
export async function persistEvaluatedQuestion(questionSetRef: DocumentReference, questionIndex: number, studentAnswer: string, evaluation: unknown): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(questionSetRef);
    const questions = (snap.data()?.questions as Array<Record<string, unknown>> | undefined) ?? [];
    if (!questions[questionIndex]) return;
    questions[questionIndex] = {
      ...questions[questionIndex],
      studentAnswer,
      aiEvaluation: evaluation,
    };
    tx.update(questionSetRef, {questions});
  });
}

/**
 * Transactionally merges `patch` into a single question's existing
 * `aiEvaluation` map without clobbering the rest of it (or other questions).
 *
 * Used by phase-2 explanation generation: phase 1 has already written
 * `aiEvaluation` (score, corrected version, `explanationStatus: "generating"`),
 * and this merges in `explanations` + `explanationStatus` once they are ready.
 */
export async function mergeQuestionEvaluation(questionSetRef: DocumentReference, questionIndex: number, patch: Record<string, unknown>): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(questionSetRef);
    const questions = (snap.data()?.questions as Array<Record<string, unknown>> | undefined) ?? [];
    if (!questions[questionIndex]) return;
    const existing = (questions[questionIndex].aiEvaluation as Record<string, unknown> | undefined) ?? {};
    questions[questionIndex] = {
      ...questions[questionIndex],
      aiEvaluation: {...existing, ...patch},
    };
    tx.update(questionSetRef, {questions});
  });
}

/** One streamed teaching bullet ({ category, detail }) for phase-2 explanation generation. */
export interface ExplanationBullet {
  category: string;
  detail: string;
}

/**
 * Appends a single explanation bullet onto the question's `aiEvaluation.explanations`
 * array while phase 2 is streaming. Keeps `explanationStatus: "generating"` until
 * the stream finishes and the caller sets `ready`.
 */
export async function appendExplanationBullet(questionSetRef: DocumentReference, questionIndex: number, bullet: ExplanationBullet): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(questionSetRef);
    const questions = (snap.data()?.questions as Array<Record<string, unknown>> | undefined) ?? [];
    if (!questions[questionIndex]) return;
    const existing = (questions[questionIndex].aiEvaluation as Record<string, unknown> | undefined) ?? {};
    const list = [...((existing.explanations as ExplanationBullet[] | undefined) ?? []), bullet];
    questions[questionIndex] = {
      ...questions[questionIndex],
      aiEvaluation: {...existing, explanations: list, explanationStatus: "generating"},
    };
    tx.update(questionSetRef, {questions});
  });
}
