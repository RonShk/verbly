import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const db = admin.firestore();

const NEW_CARD_LIMIT = 10;

export const getVocabSession = functions.https.onCall(async (data) => {
  const assignmentId = data?.assignmentId;
  const userId = data?.userId;
  if (!assignmentId || typeof assignmentId !== "string" || !userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "assignmentId and userId are required strings."
    );
  }

  // Daily vocab session: accept sentinel id "daily-vocab" (or any id; we ignore and use userId).
  const now = new Date();
  const nowTs = Timestamp.fromDate(now);

  const [dueSnap, newSnap] = await Promise.all([
    db.collection("vocab_cards").where("userId", "==", userId).where("due", "<=", nowTs).orderBy("due", "asc").get(),
    db.collection("vocab_cards").where("userId", "==", userId).where("state", "==", 0).limit(NEW_CARD_LIMIT).get(),
  ]);

  const reviewCards = dueSnap.docs.filter((d) => (d.data().state as number) !== 0);
  const seenQuestion = new Set<string>();

  const questions: Array<{
    vocabCardId: string;
    learningLanguageWord: string;
    englishWord: string;
    isNew: boolean;
  }> = [];

  for (const doc of reviewCards) {
    const d = doc.data();
    const key = `${d.learningLanguageWord}|${d.englishWord}`;
    if (seenQuestion.has(key)) continue;
    seenQuestion.add(key);
    questions.push({
      vocabCardId: doc.id,
      learningLanguageWord: d.learningLanguageWord as string,
      englishWord: d.englishWord as string,
      isNew: false,
    });
  }

  for (const doc of newSnap.docs) {
    const d = doc.data();
    const key = `${d.learningLanguageWord}|${d.englishWord}`;
    if (seenQuestion.has(key)) continue;
    seenQuestion.add(key);
    questions.push({
      vocabCardId: doc.id,
      learningLanguageWord: d.learningLanguageWord as string,
      englishWord: d.englishWord as string,
      isNew: true,
    });
  }

  const totalQuestionCount = questions.length;

  return {
    assignmentId: "daily-vocab",
    type: "VOCAB",
    assignmentTitle: "Daily Vocab",
    teacher: "",
    totalQuestionCount,
    completedQuestionCount: 0,
    questions,
  };
});
