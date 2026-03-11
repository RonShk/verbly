import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { generateTranslationQuestions } from "./generateTranslationQuestions";

const db = admin.firestore();

function getTodayDateString(utcOffsetMinutes: number): string {
  const offsetMs = utcOffsetMinutes * 60_000;
  const clientLocal = new Date(Date.now() + offsetMs);
  return clientLocal.toISOString().substring(0, 10);
}

export const getTranslationSession = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes: -(new Date().getTimezoneOffset());

  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required."
    );
  }

  const todayStr = getTodayDateString(timezoneOffsetMinutes);

  // Look for an existing assignment for today
  const existingSnap = await db.collection("user_todo_assignments")
    .where("userId", "==", userId)
    .where("type", "==", "TRANSLATION")
    .where("assignmentDate", "==", todayStr)
    .limit(1)
    .get();

  let assignmentId: string;
  let assignmentData: FirebaseFirestore.DocumentData;

  if (!existingSnap.empty) {
    const doc = existingSnap.docs[0];
    assignmentId = doc.id;
    assignmentData = doc.data();
  } else {
    const generated = await generateTranslationQuestions(userId, todayStr);
    assignmentId = generated.assignmentId;
    const doc = await db.collection("user_todo_assignments").doc(assignmentId).get();
    assignmentData = doc.data()!;
  }

  const questionSetId = assignmentData.questionSetId as string;
  if (!questionSetId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assignment has no linked question set."
    );
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

  const totalQuestionCount = (assignmentData.totalQuestionCount as number) ?? questions.length;
  const completedQuestionCount = (assignmentData.completedQuestionCount as number) ?? 0;
  const teacher = (assignmentData.teacher as string) ?? "";

  return {
    assignmentId,
    type: "TRANSLATION",
    assignmentTitle: "Translation Mode",
    teacher,
    totalQuestionCount,
    completedQuestionCount,
    questions,
  };
});
