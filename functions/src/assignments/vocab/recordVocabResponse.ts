import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import type {Grade} from "ts-fsrs";
import {
  docToCard,
  cardToUpdate,
  toRating,
  getFSRS,
  type VocabCardDoc,
} from "./fsrsCard";
import {deckCardRef, deckRef} from "./deck/paths";
import {stateCountDelta} from "./deck/summary";

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

export const recordVocabResponse = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const userId = context.auth.uid;
  const vocabCardId = data?.vocabCardId;
  const rating = data?.rating;
  const totalQuestionCount = data?.totalQuestionCount as number | undefined;
  const completedQuestionCount = data?.completedQuestionCount as number | undefined;
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : 0;

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

  const cardRef = deckCardRef(db, userId, vocabCardId);
  const deckDocRef = deckRef(db, userId);
  const cardSnap = await cardRef.get();

  if (!cardSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Vocab card not found.");
  }

  const cardData = cardSnap.data() as VocabCardDoc;
  const oldState = typeof cardData.state === "number" ? cardData.state : 0;
  const card = docToCard(cardData);
  const now = new Date();
  const grade = toRating(rating);
  const f = getFSRS();
  const {card: nextCard} = f.next(card, now, grade as Grade);
  const update = cardToUpdate(nextCard, Timestamp);

  const raw = cardData as unknown as Record<string, unknown>;
  const prevAgainCount = (raw.againCount as number | undefined) ?? 0;
  const statsUpdate: Record<string, unknown> = {};

  if (raw.firstLearnedAt == null) {
    statsUpdate.firstLearnedAt = Timestamp.fromDate(now);
  }

  if (rating <= 2) {
    const newAgainCount = prevAgainCount + 1;
    statsUpdate.lastFailureAt = Timestamp.fromDate(now);
    statsUpdate.againCount = newAgainCount;
    if (newAgainCount >= 2) statsUpdate.hardTag = true;
    if (newAgainCount >= 5) statsUpdate.leechTag = true;
  }

  const reviewTs = Timestamp.fromDate(now);

  await db.runTransaction(async (tx) => {
    tx.update(cardRef, {...update, ...statsUpdate});
    tx.set(deckDocRef, {
      studentUid: userId,
      lastReviewAt: reviewTs,
      updatedAt: FieldValue.serverTimestamp(),
      ...stateCountDelta(oldState, nextCard.state as number),
    }, {merge: true});
  });

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
