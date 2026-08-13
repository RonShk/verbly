import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {getModeConfig} from "../../core/sessionModes";
import {assignmentDocRef} from "../../core/assignmentRefs";
import {NO_VOCAB_STATUS} from "../../core/generationStatus";
import {isDeckEmpty} from "../../../../vocab/deck/deckSize";
import {consumeAiQuota} from "../../../../../utils/aiRateLimit";

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

  // Checked before the transaction (one aggregate read) so a student with no
  // assigned words never starts the AI worker — not on Home's dwell prefetch,
  // not on opening the session, not on a retry. Re-checked every call, so the
  // moment their tutor adds words the next enqueue generates normally.
  const deckEmpty = await isDeckEmpty(userId);

  // The Firestore trigger performs Gemini generation after this state change.
  // Reserve quota before allowing the transition to `generating`.
  const currentAssignment = await assignmentRef.get();
  if (!currentAssignment.exists) {
    throw new functions.https.HttpsError("not-found", "Assignment not found.");
  }
  if ((currentAssignment.data()?.userId as string | undefined) !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Assignment does not belong to this user.");
  }
  const currentStatus = currentAssignment.data()?.generationStatus as string | undefined;
  if (currentStatus !== "generating" && currentStatus !== "ready" && !deckEmpty) {
    await consumeAiQuota(context, "generation");
  }

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

    // No words to practise: record the terminal state (so the client can show a
    // friendly message rather than an error) and stop. Deliberately does not
    // flip to "generating", which is what made every Home visit and every retry
    // kick off another doomed generation.
    if (deckEmpty) {
      if (generationStatus !== NO_VOCAB_STATUS) {
        tx.update(assignmentRef, {generationStatus: NO_VOCAB_STATUS, generationError: FieldValue.delete(), totalQuestionCount: 0});
      }
      return {...meta, totalQuestionCount: 0, status: NO_VOCAB_STATUS};
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
