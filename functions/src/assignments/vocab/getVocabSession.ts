import * as functions from "firebase-functions/v1";
import { getVocabDueInfo } from "../../utils/getVocabDueInfo";

export const getVocabSession = functions.https.onCall(async (data) => {
  const assignmentId = data?.assignmentId;
  const userId = data?.userId;
  if (!assignmentId || typeof assignmentId !== "string" || !userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "assignmentId and userId are required strings."
    );
  }

  const utcOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number"
    ? data.timezoneOffsetMinutes
    : 0;

  const { reviewCards, learningCards, newCards } = await getVocabDueInfo(userId, utcOffsetMinutes);

  const seenQuestion = new Set<string>();
  const questions: Array<{
    vocabCardId: string;
    learningLanguageWord: string;
    englishWord: string;
    isNew: boolean;
  }> = [];

  for (const card of [...reviewCards, ...learningCards, ...newCards]) {
    const key = `${card.learningLanguageWord}|${card.englishWord}`;
    if (seenQuestion.has(key)) continue;
    seenQuestion.add(key);
    questions.push({
      vocabCardId: card.id,
      learningLanguageWord: card.learningLanguageWord,
      englishWord: card.englishWord,
      isNew: card.isNew,
    });
  }

  return {
    assignmentId: "daily-vocab",
    type: "VOCAB",
    assignmentTitle: "Daily Vocab",
    teacher: "",
    totalQuestionCount: questions.length,
    completedQuestionCount: 0,
    questions,
  };
});
