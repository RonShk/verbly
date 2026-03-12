import * as admin from "firebase-admin";

const db = admin.firestore();

const NEW_CARD_LIMIT = 10;

export interface VocabCard {
  id: string;
  learningLanguageWord: string;
  englishWord: string;
  state: number;
  due: Date;
  isNew: boolean;
}

export interface VocabDueInfo {
  hasCards: boolean;
  dueCount: number;
  /** Review cards (state 2) due by end of today. */
  reviewCards: VocabCard[];
  /** Learning / Relearning cards (state 1 or 3) — always included. */
  learningCards: VocabCard[];
  /** New cards (state 0), capped at 10. */
  newCards: VocabCard[];
}

/**
 * Returns the end-of-day (23:59:59.999) in the user's local timezone,
 * expressed as a UTC Date.
 */
function endOfUserDay(utcOffsetMinutes: number): Date {
  const offsetMs = utcOffsetMinutes * 60_000;
  const localNow = new Date(Date.now() + offsetMs);
  // Build midnight-end-of-day in "fake UTC" that represents local time
  const endLocal = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    23, 59, 59, 999,
  ));
  // Convert back to real UTC
  return new Date(endLocal.getTime() - offsetMs);
}

/**
 * Fetches ALL vocab cards for a user and categorises them in-memory.
 *
 * Review cards are included if their due date is before end-of-today in
 * the user's timezone, so the daily session shows everything due today.
 */
export async function getVocabDueInfo(
  userId: string,
  utcOffsetMinutes = 0,
): Promise<VocabDueInfo> {
  const snap = await db
    .collection("vocab_cards")
    .where("userId", "==", userId)
    .get();

  if (snap.empty) {
    return { hasCards: false, dueCount: 0, reviewCards: [], learningCards: [], newCards: [] };
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
      dueRaw && typeof dueRaw.toDate === "function"
        ? dueRaw.toDate()
        : dueRaw instanceof Date
          ? dueRaw
          : new Date(0);

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

  return { hasCards: true, dueCount, reviewCards, learningCards, newCards: cappedNew };
}
