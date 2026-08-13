import * as functions from "firebase-functions/v1";
import {prepareContinueReviewWave} from "../shared/home-status/dailySessionStatus";
import {consumeDailyUserActionQuota} from "../../../utils/userActionRateLimit";

/**
 * Creates (or returns) a "Continue review" wave for today's Translation. Each
 * wave is a new `user_assignments` doc (completionStatus=TODO, hidden from the
 * ASSIGNMENTS list until the first answer) with `cumulativeOffsetQuestionCount`
 * = sum of today's completed totals. AI generation is started lazily via
 * `enqueueSessionGeneration`.
 */
export const prepareTranslationContinueReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  await consumeDailyUserActionQuota(context, "translationContinueReview", 10);
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : -(new Date().getTimezoneOffset());
  return prepareContinueReviewWave(context.auth.uid, "TRANSLATION", timezoneOffsetMinutes);
});
