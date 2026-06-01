import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {getModeConfig} from "./sessionModes";

const db = admin.firestore();

/**
 * Fast, idempotent entry point for sentence-practice generation
 * (Translation/Production). Does NOT run AI inline: it creates an empty
 * question set document (status="generating") and points the assignment at it,
 * then returns immediately. A Firestore trigger
 * ([onTranslationQuestionSetCreated]/[onProductionQuestionSetCreated]) picks up
 * the new doc and streams questions into it. The client subscribes to the
 * question set doc and renders questions as they arrive.
 *
 * Idempotent: if the assignment already has a question set that is generating
 * or ready, that one is returned unchanged. A previously `failed` generation is
 * retried by creating a fresh question set.
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

  const assignmentRef = db.collection("user_todo_assignments").doc(assignmentId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(assignmentRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError("not-found", "Assignment not found.");
    }
    const assignment = snap.data()!;
    if ((assignment.userId as string) !== userId) {
      throw new functions.https.HttpsError("permission-denied", "Assignment does not belong to this user.");
    }

    const config = getModeConfig(assignment.type as string);
    const existingQuestionSetId = assignment.questionSetId as string | undefined;
    const generationStatus = (assignment.generationStatus as string | undefined) ?? (existingQuestionSetId ? "ready" : "none");

    const meta = {
      assignmentId,
      type: config.type,
      assignmentTitle: config.assignmentTitle,
      teacher: (assignment.teacher as string) ?? "AI Generated",
      totalQuestionCount: (assignment.totalQuestionCount as number) ?? config.questionCount,
      completedQuestionCount: (assignment.completedQuestionCount as number) ?? 0,
      cumulativeOffsetQuestionCount: (assignment.cumulativeOffsetQuestionCount as number | undefined) ?? 0,
    };

    // Reuse an in-flight or completed generation. A failed one falls through
    // to regeneration below.
    if (existingQuestionSetId && generationStatus !== "failed") {
      return {...meta, questionSetId: existingQuestionSetId, status: generationStatus};
    }

    const questionSetRef = db.collection(config.questionSetCollection).doc();
    tx.set(questionSetRef, {
      userId,
      type: config.type,
      learningLanguage: config.learningLanguage,
      assignmentId,
      status: "generating",
      questions: [],
      generatedCount: 0,
      targetQuestionCount: config.questionCount,
      timezoneOffsetMinutes,
      createdAt: Timestamp.now(),
    });
    tx.update(assignmentRef, {
      questionSetId: questionSetRef.id,
      generationStatus: "generating",
      totalQuestionCount: config.questionCount,
    });

    return {
      ...meta,
      questionSetId: questionSetRef.id,
      status: "generating",
      totalQuestionCount: config.questionCount,
    };
  });
});
