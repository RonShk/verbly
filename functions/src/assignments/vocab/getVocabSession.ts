import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

/** Shuffle array in place (Fisher–Yates) and return it. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const getVocabSession = functions.https.onCall(async (data) => {
  const assignmentId = data?.assignmentId;
  const userId = data?.userId;
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
  if (type !== "VOCAB") {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This callable is for VOCAB assignments only."
    );
  }

  const vocabListId = assignment.vocabListId as string | undefined;
  if (!vocabListId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Assignment has no linked vocab list."
    );
  }

  const vocabSnap = await db.collection("vocab_lists").doc(vocabListId).get();
  if (!vocabSnap.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Vocab list not found."
    );
  }

  const vocab = vocabSnap.data()!;
  const words = (vocab.words as Array<{ learningLanguageWord: string; englishWord: string }>) || [];
  const totalQuestionCount = Math.min(
    (assignment.totalQuestionCount as number) ?? words.length,
    words.length
  );

  const shuffled = shuffle([...words]).slice(0, totalQuestionCount);
  const questions = shuffled.map((w, i) => ({
    index: i,
    learningLanguageWord: w.learningLanguageWord,
    englishWord: w.englishWord,
  }));

  const completedQuestionCount = (assignment.completedQuestionCount as number) ?? 0;
  const teacher = (assignment.teacher as string) ?? "";

  return {
    assignmentId,
    type,
    assignmentTitle: "Weekly Vocab",
    teacher,
    totalQuestionCount,
    completedQuestionCount,
    questions,
  };
});
