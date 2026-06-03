import * as functions from "firebase-functions/v1";
import {prepareContinueReviewWave} from "../shared/home-status/dailySessionStatus";

/**
 * Creates (or returns) a "Continue review" wave for today's Production. Each
 * wave is a new `user_assignments` doc (completionStatus=TODO, hidden from the
 * ASSIGNMENTS list until the first answer) with `cumulativeOffsetQuestionCount`
 * = sum of today's completed totals. AI generation is started lazily via
 * `enqueueSessionGeneration`.
 */
export const prepareProductionContinueReview = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : -(new Date().getTimezoneOffset());
  return prepareContinueReviewWave(context.auth.uid, "PRODUCTION", timezoneOffsetMinutes);
});
