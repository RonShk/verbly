import * as admin from "firebase-admin";
import {Timestamp, type DocumentReference} from "firebase-admin/firestore";

const db = admin.firestore();

/**
 * Data from a user_todo_assignments document needed to move it to completed.
 */
export interface TodoAssignmentFields {
  type: string;
  teacher: string;
  totalQuestionCount: number;
  assignmentDate?: string;
}

/**
 * Updates the assignment's completed count. If the assignment is now complete
 * (completedQuestionCount >= totalQuestionCount), moves it to
 * user_completed_assignments and deletes the todo; otherwise updates the todo
 * with the new count.
 *
 * @return Whether the assignment was completed (moved to user_completed_assignments).
 */
export async function updateAssignmentProgress(assignmentRef: DocumentReference, assignment: TodoAssignmentFields, userId: string, completedQuestionCount: number): Promise<{ assignmentCompleted: boolean }> {
  const totalQuestionCount = assignment.totalQuestionCount;
  const assignmentCompleted = completedQuestionCount >= totalQuestionCount;

  if (assignmentCompleted) {
    await db.runTransaction(async (tx) => {
      const completedDoc: Record<string, unknown> = {
        userId,
        type: assignment.type,
        teacher: assignment.teacher,
        totalQuestionCount,
        completedAt: Timestamp.now(),
      };
      if (assignment.assignmentDate) {
        completedDoc.assignmentDate = assignment.assignmentDate;
      }
      tx.set(db.collection("user_completed_assignments").doc(), completedDoc);
      tx.delete(assignmentRef);
    });
  } else {
    // For "Continue review" (wave 2+) todos we initially set
    // hideFromAssignmentsTabUntilFirstProgress=true so the row stays under
    // COMPLETED on Home until the user answers a question. Clear it on the
    // first progress so the row moves back to ASSIGNMENTS.
    const update: Record<string, unknown> = {completedQuestionCount};
    if (completedQuestionCount === 1) {
      update.hideFromAssignmentsTabUntilFirstProgress = false;
    }
    await assignmentRef.update(update);
  }

  return {assignmentCompleted};
}
