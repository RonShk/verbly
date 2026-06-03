import {FieldValue, type DocumentReference} from "firebase-admin/firestore";
import {questionDocRef} from "../../core/assignmentRefs";

/**
 * Merges `patch` into a single question's existing `aiEvaluation` map without
 * clobbering its siblings. Used by phase-2 explanation generation to update
 * `explanations` / `explanationStatus` after phase 1 wrote the score.
 */
export async function mergeQuestionEvaluation(assignmentRef: DocumentReference, questionIndex: number, patch: Record<string, unknown>): Promise<void> {
  const update: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) update[`aiEvaluation.${key}`] = value;
  await questionDocRef(assignmentRef, questionIndex).update(update).catch(() => undefined);
}

/** One streamed teaching bullet ({ category, detail }) for phase-2 explanation generation. */
export interface ExplanationBullet {
  category: string;
  detail: string;
}

/**
 * Appends a single explanation bullet onto the question's
 * `aiEvaluation.explanations` array while phase 2 is streaming, keeping
 * `explanationStatus: "generating"` until the caller sets `ready`.
 */
export async function appendExplanationBullet(assignmentRef: DocumentReference, questionIndex: number, bullet: ExplanationBullet): Promise<void> {
  await questionDocRef(assignmentRef, questionIndex).update({
    "aiEvaluation.explanations": FieldValue.arrayUnion(bullet),
    "aiEvaluation.explanationStatus": "generating",
  }).catch(() => undefined);
}
