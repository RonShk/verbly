import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {getModeConfig} from "../../core/sessionModes";
import {assignmentDocRef} from "../../core/assignmentRefs";

/**
 * Fast, idempotent entry point for sentence-practice generation
 * (Translation/Production). Does NOT run AI inline: it flips the assignment's
 * `generationStatus` to "generating" and returns immediately. A Firestore
 * trigger ([onAssignmentGenerationRequested]) observes that transition and
 * streams questions into the assignment's `questions` subcollection. The client
 * subscribes to the assignment doc + its questions and renders as they arrive.
 *
 * Idempotent: if generation is already in-flight ("generating") or done
 * ("ready"), nothing is re-triggered. A previously "failed" generation is
 * retried by flipping back to "generating" (the worker clears any partial
 * questions before regenerating).
 *
 * Called when the user taps Start/Continue (via the session page) and also as a
 * background prefetch when the user dwells on Home.
 */
export const enqueueSessionGeneration = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const userId = context.auth.uid;
  const assignmentId = data?.assignmentId;
  if (!assignmentId || typeof assignmentId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "assignmentId is required.");
  }
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : 0;

  const assignmentRef = assignmentDocRef(assignmentId);

  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(assignmentRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Assignment not found.");
    }
    const assignment = snap.data()!;
    if ((assignment.userId as string) !== userId) {
      throw new functions.https.HttpsError("permission-denied", "Assignment does not belong to this user.");
    }

    const config = getModeConfig(assignment.type as string);
    const totalQuestionCount = config.questionCount;
    const generationStatus = (assignment.generationStatus as string | undefined) ?? "none";

    const meta = {
      assignmentId,
      type: config.type,
      assignmentTitle: config.assignmentTitle,
      teacher: (assignment.teacher as string) ?? "AI Generated",
      totalQuestionCount: (assignment.totalQuestionCount as number) ?? totalQuestionCount,
      completedQuestionCount: (assignment.completedQuestionCount as number) ?? 0,
      cumulativeOffsetQuestionCount: (assignment.cumulativeOffsetQuestionCount as number | undefined) ?? 0,
    };

    // Reuse an in-flight or finished generation; only a failed one regenerates.
    if (generationStatus === "generating" || generationStatus === "ready") {
      return {...meta, status: generationStatus};
    }

    tx.update(assignmentRef, {
      generationStatus: "generating",
      generationError: FieldValue.delete(),
      totalQuestionCount,
      timezoneOffsetMinutes,
    });

    return {...meta, status: "generating", totalQuestionCount};
  });
});
