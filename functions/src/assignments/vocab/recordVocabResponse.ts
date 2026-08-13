import * as functions from "firebase-functions/v1";
import {recordVocabReview, VocabCardNotFoundError} from "./recordVocabReview";

/**
 * Records an FSRS rating for one vocab card and advances the persisted daily
 * wave (see recordVocabReview). `assignmentId` / `questionIndex` identify the
 * question doc to mark done or re-queue; the legacy `daily-vocab` sentinel is
 * treated as "no wave" so an older client still records the review.
 */
export const recordVocabResponse = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const vocabCardId = data?.vocabCardId;
  const rating = data?.rating;

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

  try {
    return await recordVocabReview(context.auth.uid, {
      vocabCardId,
      rating,
      assignmentId: typeof data?.assignmentId === "string" && data.assignmentId !== "daily-vocab" ? data.assignmentId : "",
      questionIndex: typeof data?.questionIndex === "number" ? data.questionIndex : null,
      timezoneOffsetMinutes: typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : 0,
    });
  } catch (err) {
    if (err instanceof VocabCardNotFoundError) {
      throw new functions.https.HttpsError("not-found", err.message);
    }
    throw err;
  }
});
