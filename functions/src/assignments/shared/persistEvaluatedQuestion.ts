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
