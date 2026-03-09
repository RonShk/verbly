import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { Grade } from "ts-fsrs";
import {
  docToCard,
  cardToUpdate,
  toRating,
  getFSRS,
  type VocabCardDoc,
} from "./fsrsCard";

const db = admin.firestore();

/**
 * Returns true if the given UTC date falls on the same calendar day as "now" in the user's timezone,
 * or on an earlier day. Returns false if the due date is tomorrow or later in the user's timezone.
 * Uses same offset convention as getWeekBounds: offset is added to UTC to get local (e.g. PST = -480).
 */
function isStillDueToday(dueUtc: Date, nowUtc: Date, timezoneOffsetMinutes: number): boolean {
  const offsetMs = timezoneOffsetMinutes * 60 * 1000;
  const userNow = new Date(nowUtc.getTime() + offsetMs);
  const dueInUserTz = new Date(dueUtc.getTime() + offsetMs);
  const todayDay = userNow.getUTCFullYear() * 10000 + userNow.getUTCMonth() * 100 + userNow.getUTCDate();
  const dueDay = dueInUserTz.getUTCFullYear() * 10000 + dueInUserTz.getUTCMonth() * 100 + dueInUserTz.getUTCDate();
  return dueDay <= todayDay;
}

export const recordVocabResponse = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  const vocabCardId = data?.vocabCardId;
  const rating = data?.rating;
  const totalQuestionCount = data?.totalQuestionCount as number | undefined;
  const completedQuestionCount = data?.completedQuestionCount as number | undefined;
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : 0;

  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required and must be a string."
    );
  }
  if (!vocabCardId || typeof vocabCardId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "vocabCardId is required and must be a string."
    );
  }
  if (typeof rating !== "number" || rating < 1 || rating > 4) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "rating must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)."
    );
  }

  const cardRef = db.collection("vocab_cards").doc(vocabCardId);
  const cardSnap = await cardRef.get();

  if (!cardSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Vocab card not found.");
  }

  const cardData = cardSnap.data() as VocabCardDoc;
  if (cardData.userId !== userId) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Vocab card does not belong to this user."
    );
  }

  const card = docToCard(cardData);
  const now = new Date();
  const grade = toRating(rating);
  const f = getFSRS();
  const { card: nextCard } = f.next(card, now, grade as Grade);

  const update = cardToUpdate(nextCard, Timestamp);
  await cardRef.update(update);

  const total = typeof totalQuestionCount === "number" ? totalQuestionCount : 0;
  const completed = (typeof completedQuestionCount === "number" ? completedQuestionCount : 0) + 1;
  const assignmentCompleted = total > 0 && completed >= total;
  const stillDueToday = isStillDueToday(nextCard.due, now, timezoneOffsetMinutes);

  return {
    completedQuestionCount: completed,
    totalQuestionCount: total,
    assignmentCompleted,
    stillDueToday,
  };
});
