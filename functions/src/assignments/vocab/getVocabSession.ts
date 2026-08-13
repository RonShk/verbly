import * as functions from "firebase-functions/v1";
import {loadVocabSessionById, resolveTodayVocabSession} from "./dailyVocabAssignment";

/**
 * Returns today's vocab wave, persisted as a `user_assignments` doc with its
 * drawn cards in the `questions` subcollection. Creates the day's first wave on
 * demand; subsequent calls (app refresh, cold start, revisiting Home) return the
 * same wave with its remaining cards and progress, so a session survives a
 * reload instead of restarting from the client cache.
 *
 * `assignmentId` is optional: pass it to open a specific wave (deep link), omit
 * it to resolve today's. Unknown ids — including the legacy `daily-vocab`
 * sentinel — fall back to today's wave.
 */
export const getVocabSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const userId = context.auth.uid;
  const utcOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : 0;
  const assignmentId = typeof data?.assignmentId === "string" ? data.assignmentId : "";

  if (assignmentId && assignmentId !== "daily-vocab") {
    const existing = await loadVocabSessionById(userId, assignmentId);
    if (existing) return existing;
  }

  return resolveTodayVocabSession(userId, utcOffsetMinutes);
});
