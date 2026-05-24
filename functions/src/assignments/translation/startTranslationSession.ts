import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {generateTranslationQuestions} from "./generateTranslationQuestions";

const db = admin.firestore();

/**
 * Hydrates a Translation assignment with AI-generated questions and returns
 * the full session payload. Idempotent: if the assignment already has a
 * `questionSetId`, no AI generation occurs and the existing questions are
 * returned.
 *
 * This callable is the ONLY place where AI question generation happens for
 * Translation, and is only invoked as an explicit user action (Start/Continue).
 */
export const startTranslationSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const userId = context.auth.uid;
  const assignmentId = data?.assignmentId;

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
  if ((assignment.type as string) !== "TRANSLATION") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assignment is not a TRANSLATION assignment."
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
    const generated = await generateTranslationQuestions(userId, assignmentDate, assignmentId);
    questionSetId = generated.questionSetId;
  }

  const questionSetSnap = await db.collection("translation_question_sets").doc(questionSetId).get();
  if (!questionSetSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Translation question set not found."
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
    type: "TRANSLATION",
    assignmentTitle: "Translation Mode",
    teacher,
    totalQuestionCount,
    completedQuestionCount,
    cumulativeOffsetQuestionCount,
    questions,
  };
});
