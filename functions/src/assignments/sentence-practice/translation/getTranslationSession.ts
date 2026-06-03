import * as functions from "firebase-functions/v1";
import {resolveDailySessionStatus} from "../shared/home-status/dailySessionStatus";

/**
 * Stub-only lookup for today's Translation assignment status over the unified
 * `user_assignments` collection. Does NOT generate questions; safe to call from
 * Home-load providers. AI generation is deferred to `enqueueSessionGeneration`.
 */
export const getTranslationSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : -(new Date().getTimezoneOffset());
  return resolveDailySessionStatus(context.auth.uid, "TRANSLATION", timezoneOffsetMinutes);
});
