import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();

/** Max new cards per day: 5 new + up to 10 learning/review = 15 total. */
const NEW_CARD_LIMIT = 5;
/** Total cards in one daily session. We always fill up to this when possible. */
const DAILY_SESSION_CAP = 15;

interface VocabCard {
  id: string;
  learningLanguageWord: string;
  englishWord: string;
  state: number;
  due: Date;
  isNew: boolean;
}

interface VocabDueInfo {
  hasCards: boolean;
  dueCount: number;
  /** Review cards (state 2) due by end of today. */
  reviewCards: VocabCard[];
  /** Learning / Relearning cards (state 1 or 3) — always included first in session. */
  learningCards: VocabCard[];
  /** New cards (state 0), capped at NEW_CARD_LIMIT (5). */
  newCards: VocabCard[];
}

function endOfUserDay(utcOffsetMinutes: number): Date {
  const offsetMs = utcOffsetMinutes * 60_000;
  const localNow = new Date(Date.now() + offsetMs);
  const endLocal = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    23, 59, 59, 999,
  ));
  return new Date(endLocal.getTime() - offsetMs);
}

async function getVocabDueInfo(userId: string, utcOffsetMinutes = 0): Promise<VocabDueInfo> {
  const snap = await db.collection("vocab_cards").where("userId", "==", userId).get();

  if (snap.empty) {
    return {hasCards: false, dueCount: 0, reviewCards: [], learningCards: [], newCards: []};
  }

  const cutoff = endOfUserDay(utcOffsetMinutes);

  const reviewCards: VocabCard[] = [];
  const learningCards: VocabCard[] = [];
  const newCards: VocabCard[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const state = typeof data.state === "number" ? data.state : -1;
    const dueRaw = data.due;
    const due: Date =
      dueRaw && typeof dueRaw.toDate === "function" ? dueRaw.toDate(): dueRaw instanceof Date ? dueRaw : new Date(0);

    const card: VocabCard = {
      id: doc.id,
      learningLanguageWord: (data.learningLanguageWord as string) ?? "",
      englishWord: (data.englishWord as string) ?? "",
      state,
      due,
      isNew: state === 0,
    };

    if (state === 0) {
      newCards.push(card);
    } else if (state === 1 || state === 3) {
      learningCards.push(card);
    } else if (due <= cutoff) {
      reviewCards.push(card);
    }
  }

  const cappedNew = newCards.slice(0, NEW_CARD_LIMIT);
  const dueCount = reviewCards.length + learningCards.length + cappedNew.length;

  return {hasCards: true, dueCount, reviewCards, learningCards, newCards: cappedNew};
}

export const getVocabSession = functions.https.onCall(async (data, context) => {
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

  const utcOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ?
    data.timezoneOffsetMinutes :
    0;

  const {reviewCards, learningCards, newCards} = await getVocabDueInfo(userId, utcOffsetMinutes);

  // Priority: learning (all) → new (up to NEW_CARD_LIMIT) → review (fill to DAILY_SESSION_CAP).
  const newSlice = newCards.slice(0, NEW_CARD_LIMIT);
  const orderedCards = [...learningCards, ...newSlice, ...reviewCards];

  const seenQuestion = new Set<string>();
  const questions: Array<{
    vocabCardId: string;
    learningLanguageWord: string;
    englishWord: string;
    isNew: boolean;
  }> = [];

  for (const card of orderedCards) {
    if (questions.length >= DAILY_SESSION_CAP) break;
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
