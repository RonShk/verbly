import * as functions from "firebase-functions/v1";
import {streamGenerateSessionQuestions} from "./helpers/generateSessionQuestions";
import {getModeConfig} from "../../core/sessionModes";
import {ASSIGNMENTS_COLLECTION} from "../../core/assignmentRefs";

const RUNTIME = {timeoutSeconds: 300, memory: "256MB" as const};

/**
 * Starts question generation when an assignment's `generationStatus` transitions
 * into "generating" (set by [enqueueSessionGeneration]). Fires on the same
 * transition for both a brand-new request and a retry of a failed one; the
 * worker writes questions into the assignment's `questions` subcollection and
 * owns the terminal "ready"/"failed" state on the parent.
 *
 * Guarded so the worker's own parent updates (status → ready/failed, progress
 * counts) never re-trigger generation: we only act when the status was NOT
 * already "generating" before the write.
 */
export const onAssignmentGenerationRequested = functions
  .runWith(RUNTIME)
  .firestore.document(`${ASSIGNMENTS_COLLECTION}/{assignmentId}`)
  .onWrite(async (change) => {
    const after = change.after.data();
    if (!after || after.generationStatus !== "generating") return;
    if (change.before.data()?.generationStatus === "generating") return;

    const type = after.type as string | undefined;
    const userId = after.userId as string | undefined;
    if (!type || !userId) return;

    const timezoneOffsetMinutes = typeof after.timezoneOffsetMinutes === "number" ? after.timezoneOffsetMinutes : 0;
    await streamGenerateSessionQuestions(getModeConfig(type), userId, change.after.ref, timezoneOffsetMinutes);
  });
