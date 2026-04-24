import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {generateProductionQuestions} from "./generateProductionQuestions";

const db = admin.firestore();

/**
 * Hydrates a Production assignment with AI-generated questions and returns
 * the full session payload. Idempotent: if the assignment already has a
 * `questionSetId`, no AI generation occurs and the existing questions are
 * returned.
 *
 * This callable is the ONLY place where AI question generation happens for
 * Production, and is only invoked as an explicit user action (Start/Continue).
 */
export const startProductionSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const userId = data?.userId;
  const assignmentId = data?.assignmentId;

  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required."
    );
  }
  if (!assignmentId || typeof assignmentId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "assignmentId is required."
    );
  }

  const assignmentRef = db.collection("user_todo_assignments").doc(assignmentId);
  const assignmentSnap = await assignmentRef.get();

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
  if ((assignment.type as string) !== "PRODUCTION") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assignment is not a PRODUCTION assignment."
    );
  }

  let questionSetId = assignment.questionSetId as string | undefined;

  if (!questionSetId) {
    const assignmentDate = (assignment.assignmentDate as string | undefined) ?? "";
    if (!assignmentDate) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Assignment is missing assignmentDate."
      );
    }
    const generated = await generateProductionQuestions(userId, assignmentDate, assignmentId);
    questionSetId = generated.questionSetId;
  }

  const questionSetSnap = await db.collection("production_question_sets").doc(questionSetId).get();
  if (!questionSetSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Production question set not found."
    );
  }

  const questionSet = questionSetSnap.data()!;
  const questions = (questionSet.questions as Array<Record<string, unknown>>) || [];

  const freshSnap = await assignmentRef.get();
  const fresh = freshSnap.data()!;

  const totalQuestionCount = (fresh.totalQuestionCount as number) ?? questions.length;
  const completedQuestionCount = (fresh.completedQuestionCount as number) ?? 0;
  const teacher = (fresh.teacher as string) ?? "AI Generated";
  const cumulativeOffsetQuestionCount = (fresh.cumulativeOffsetQuestionCount as number | undefined) ?? 0;

  return {
    assignmentId,
    type: "PRODUCTION",
    assignmentTitle: "Production Mode",
    teacher,
    totalQuestionCount,
    completedQuestionCount,
    cumulativeOffsetQuestionCount,
    questions,
  };
});
