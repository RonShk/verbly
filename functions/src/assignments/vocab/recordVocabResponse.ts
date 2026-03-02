import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { updateAssignmentProgress } from "../../utils/assignmentProgress";

const db = admin.firestore();

export const recordVocabResponse = functions.https.onCall(async (data) => {
  const assignmentId = data?.assignmentId;
  const userId = data?.userId;
  const questionIndex = data?.questionIndex;

  if (
    !assignmentId ||
    typeof assignmentId !== "string" ||
    !userId ||
    typeof userId !== "string"
  ) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "assignmentId and userId are required strings."
    );
  }
  if (typeof questionIndex !== "number" || questionIndex < 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "questionIndex must be a non-negative number."
    );
  }

  const assignmentRef = db.collection("user_todo_assignments").doc(assignmentId);
  const assignmentSnap = await assignmentRef.get();

  if (!assignmentSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Assignment not found."
    );
  }

  const assignment = assignmentSnap.data()!;
  if ((assignment.userId as string) !== userId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Assignment does not belong to this user."
    );
  }

  const totalQuestionCount = (assignment.totalQuestionCount as number) ?? 0;
  let completedQuestionCount = (assignment.completedQuestionCount as number) ?? 0;
  completedQuestionCount = Math.min(completedQuestionCount + 1, totalQuestionCount);

  const { assignmentCompleted } = await updateAssignmentProgress(
    assignmentRef,
    {
      dueDate: assignment.dueDate,
      type: assignment.type as string,
      teacher: assignment.teacher as string,
      totalQuestionCount,
    },
    userId,
    completedQuestionCount
  );

  return {
    completedQuestionCount,
    totalQuestionCount,
    assignmentCompleted,
  };
});
