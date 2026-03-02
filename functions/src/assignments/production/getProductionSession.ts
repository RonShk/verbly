import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const getProductionSession = functions.https.onCall(async (data) => {
  const assignmentId = data?.assignmentId;
  const userId = data?.userId;

  if (!assignmentId || typeof assignmentId !== "string" || !userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "assignmentId and userId are required strings."
    );
  }

  const assignmentSnap = await db.collection("user_todo_assignments").doc(assignmentId).get();

  if (!assignmentSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Assignment not found.");
  }

  const assignment = assignmentSnap.data()!;
  if ((assignment.userId as string) !== userId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Assignment does not belong to this user."
    );
  }

  const type = (assignment.type as string) || "";
  if (type !== "PRODUCTION") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This callable is for PRODUCTION assignments only."
    );
  }

  const questionSetId = assignment.questionSetId as string | undefined;
  if (!questionSetId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assignment has no linked question set. Re-seed data to fix."
    );
  }

  const questionSetSnap = await db.collection("production_question_sets").doc(questionSetId).get();

  if (!questionSetSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Production question set not found."
    );
  }

  const questionSet = questionSetSnap.data()!;
  const questions =(
      questionSet.questions as Array<{
      index: number;
      sentenceInNativeLanguage: string;
      vocabWordsUsed: string[];
      studentAnswer: string | null;
      aiEvaluation: {
        score: number;
        feedback: string;
        correctedVersion: string;
        explanations: Array<{ category: string; detail: string }>;
      } | null;
  }>) || [];

  const totalQuestionCount = (assignment.totalQuestionCount as number) ?? questions.length;
  const completedQuestionCount = (assignment.completedQuestionCount as number) ?? 0;
  const teacher = (assignment.teacher as string) ?? "";

  return {
    assignmentId,
    type,
    assignmentTitle: "Production Mode",
    teacher,
    totalQuestionCount,
    completedQuestionCount,
    questions,
  };
});
