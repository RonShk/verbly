import * as admin from "firebase-admin";
import {type DocumentReference} from "firebase-admin/firestore";

/**
 * Single unified collection for sentence-practice assignments (issue #58).
 * Each assignment is a top-level doc; its questions live in a `questions`
 * subcollection (one doc per question, id = the question's 0-based index).
 * Replaces the old split between user_todo_assignments /
 * user_completed_assignments and the *_question_sets collections.
 */
export const ASSIGNMENTS_COLLECTION = "user_assignments";
export const QUESTIONS_SUBCOLLECTION = "questions";

/** Reference to an assignment doc. */
export function assignmentDocRef(assignmentId: string): DocumentReference {
  return admin.firestore().collection(ASSIGNMENTS_COLLECTION).doc(assignmentId);
}

/** Reference to a single question doc under an assignment (id = its index). */
export function questionDocRef(assignmentRef: DocumentReference, questionIndex: number): DocumentReference {
  return assignmentRef.collection(QUESTIONS_SUBCOLLECTION).doc(String(questionIndex));
}
