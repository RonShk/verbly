import * as functions from "firebase-functions/v1";
import {prepareVocabContinueReviewWave} from "./dailyVocabAssignment";
import {consumeDailyUserActionQuota} from "../../utils/userActionRateLimit";

/**
 * Creates (or returns) a "Continue review" wave for today's vocab: a new
 * `user_assignments` doc holding a freshly drawn batch of due cards, with
 * `cumulativeOffsetQuestionCount` = sum of today's completed wave totals.
 * Mirrors `prepare{Translation,Production}ContinueReview`.
 */
export const prepareVocabContinueReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  await consumeDailyUserActionQuota(context, "vocabContinueReview", 10);
  const utcOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : 0;
  return prepareVocabContinueReviewWave(context.auth.uid, utcOffsetMinutes);
});
