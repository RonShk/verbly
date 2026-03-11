import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { generateProductionQuestions } from "./generateProductionQuestions";

const db = admin.firestore();

function getTodayDateString(utcOffsetMinutes: number): string {
  const offsetMs = utcOffsetMinutes * 60_000;
  const clientLocal = new Date(Date.now() + offsetMs);
  return clientLocal.toISOString().substring(0, 10);
}

export const getProductionSession = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number"
    ? data.timezoneOffsetMinutes
    : -(new Date().getTimezoneOffset());

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
    .where("type", "==", "PRODUCTION")
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
    const generated = await generateProductionQuestions(userId, todayStr);
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

  const questionSetSnap = await db.collection("production_question_sets").doc(questionSetId).get();

  if (!questionSetSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Production question set not found."
    );
  }

  const questionSet = questionSetSnap.data()!;
  const questions = (questionSet.questions as Array<Record<string, unknown>>) || [];

  const totalQuestionCount = (assignmentData.totalQuestionCount as number) ?? questions.length;
  const completedQuestionCount = (assignmentData.completedQuestionCount as number) ?? 0;
  const teacher = (assignmentData.teacher as string) ?? "";

  return {
    assignmentId,
    type: "PRODUCTION",
    assignmentTitle: "Production Mode",
    teacher,
    totalQuestionCount,
    completedQuestionCount,
    questions,
  };
});
