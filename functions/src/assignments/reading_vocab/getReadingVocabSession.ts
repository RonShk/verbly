import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const getReadingVocabSession = functions.https.onCall(async (data) => {
  const assignmentId = data?.assignmentId;
  const userId = data?.userId;
  if (!assignmentId || typeof assignmentId !== "string" || !userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "assignmentId and userId are required strings."
    );
  }

  const assignmentSnap = await db
    .collection("user_todo_assignments")
    .doc(assignmentId)
    .get();

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

  const type = (assignment.type as string) || "";
  if (type !== "READING_VOCAB") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This callable is for READING_VOCAB assignments only."
    );
  }

  const questionSetId = assignment.questionSetId as string | undefined;
  if (!questionSetId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assignment has no linked question set. Re-seed data to fix."
    );
  }

  const questionSetSnap = await db
    .collection("reading_vocab_question_sets")
    .doc(questionSetId)
    .get();

  if (!questionSetSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Reading vocab question set not found."
    );
  }

  const questionSet = questionSetSnap.data()!;
  const questions = (
      questionSet.questions as Array<{
      index: number;
      sentenceInLearningLanguage: string;
      englishMeaning: string;
      vocabWordsUsed: string[];
    }>) || [];

  const totalQuestionCount = (assignment.totalQuestionCount as number) ?? questions.length;
  const completedQuestionCount = (assignment.completedQuestionCount as number) ?? 0;
  const teacher = (assignment.teacher as string) ?? "";

  return {
    assignmentId,
    type,
    assignmentTitle: "Reading Vocab",
    teacher,
    totalQuestionCount,
    completedQuestionCount,
    questions,
  };
});
