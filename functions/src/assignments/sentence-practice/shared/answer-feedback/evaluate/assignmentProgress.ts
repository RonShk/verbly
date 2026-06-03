import {Timestamp, type DocumentReference} from "firebase-admin/firestore";

/**
 * Advances an assignment's completed count. When the assignment is now complete
 * (completedQuestionCount >= totalQuestionCount) it is marked
 * `completionStatus: "COMPLETED"` with a `completedAt` timestamp — an in-place update
 * on the same doc, no copy/move between collections (issue #58).
 *
 * @return Whether the assignment just reached completion.
 */
export async function updateAssignmentProgress(assignmentRef: DocumentReference, totalQuestionCount: number, completedQuestionCount: number): Promise<{ assignmentCompleted: boolean }> {
  const assignmentCompleted = completedQuestionCount >= totalQuestionCount;

  const update: Record<string, unknown> = {completedQuestionCount};
  if (assignmentCompleted) {
    update.completionStatus = "COMPLETED";
    update.completedAt = Timestamp.now();
  } else if (completedQuestionCount === 1) {
    // A wave-2+ "Continue review" todo starts hidden under COMPLETED on Home
    // (hideFromAssignmentsTabUntilFirstProgress). Clear it on the first answer
    // so the row moves back to ASSIGNMENTS.
    update.hideFromAssignmentsTabUntilFirstProgress = false;
  }

  await assignmentRef.update(update);
  return {assignmentCompleted};
}
