import * as admin from "firebase-admin";
import { Timestamp, type DocumentReference } from "firebase-admin/firestore";

const db = admin.firestore();

/**
 * Data from a user_todo_assignments document needed to move it to completed.
 */
export interface TodoAssignmentFields {
  dueDate: Timestamp;
  type: string;
  teacher: string;
  totalQuestionCount: number;
}

/**
 * Updates the assignment's completed count. If the assignment is now complete
 * (completedQuestionCount >= totalQuestionCount), moves it to
 * user_completed_assignments and deletes the todo; otherwise updates the todo
 * with the new count.
 *
 * @returns Whether the assignment was completed (moved to user_completed_assignments).
 */
export async function updateAssignmentProgress(assignmentRef: DocumentReference, assignment: TodoAssignmentFields, userId: string, completedQuestionCount: number): Promise<{ assignmentCompleted: boolean }> {
  const totalQuestionCount = assignment.totalQuestionCount;
  const assignmentCompleted = completedQuestionCount >= totalQuestionCount;

  if (assignmentCompleted) {
    await db.runTransaction(async (tx) => {
      tx.set(db.collection("user_completed_assignments").doc(), {
        userId,
        type: assignment.type,
        teacher: assignment.teacher,
        dueDate: assignment.dueDate,
        totalQuestionCount,
        completedAt: Timestamp.now(),
      });
      tx.delete(assignmentRef);
    });
  } else {
    await assignmentRef.update({ completedQuestionCount });
  }

  return { assignmentCompleted };
}
