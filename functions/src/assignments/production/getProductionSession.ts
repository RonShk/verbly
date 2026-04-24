import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";

const db = admin.firestore();

function getTodayDateString(utcOffsetMinutes: number): string {
  const offsetMs = utcOffsetMinutes * 60_000;
  const clientLocal = new Date(Date.now() + offsetMs);
  return clientLocal.toISOString().substring(0, 10);
}

/**
 * Stub-only lookup for today's Production assignment status.
 *
 * Does NOT generate questions. Safe to call from Home-load providers.
 *
 * Resolution order:
 *  1. If there is a todo doc for today/PRODUCTION, return it with placement=TODO.
 *  2. Else if there is a completed doc for today/PRODUCTION, return placement=COMPLETED.
 *  3. Else create an empty stub todo doc (no questionSetId, 0/10) and return it.
 *
 * AI generation is deferred to `startProductionSession`.
 */
export const getProductionSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const userId = data?.userId;
  const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ?
    data.timezoneOffsetMinutes :
    -(new Date().getTimezoneOffset());

  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required."
    );
  }

  const todayStr = getTodayDateString(timezoneOffsetMinutes);
  const DEFAULT_TOTAL = 10;

  const todoSnap = await db.collection("user_todo_assignments")
    .where("userId", "==", userId)
    .where("type", "==", "PRODUCTION")
    .where("assignmentDate", "==", todayStr)
    .limit(1)
    .get();

  if (!todoSnap.empty) {
    const doc = todoSnap.docs[0];
    const d = doc.data();
    return {
      placement: "TODO",
      assignmentId: doc.id,
      type: "PRODUCTION",
      teacher: (d.teacher as string) ?? "AI Generated",
      completedQuestionCount: (d.completedQuestionCount as number) ?? 0,
      totalQuestionCount: (d.totalQuestionCount as number) ?? DEFAULT_TOTAL,
    };
  }

  const completedSnap = await db.collection("user_completed_assignments")
    .where("userId", "==", userId)
    .where("type", "==", "PRODUCTION")
    .where("assignmentDate", "==", todayStr)
    .limit(1)
    .get();

  if (!completedSnap.empty) {
    const doc = completedSnap.docs[0];
    const d = doc.data();
    const total = (d.totalQuestionCount as number) ?? DEFAULT_TOTAL;
    return {
      placement: "COMPLETED",
      assignmentId: null,
      type: "PRODUCTION",
      teacher: (d.teacher as string) ?? "AI Generated",
      completedQuestionCount: total,
      totalQuestionCount: total,
    };
  }

  const now = Timestamp.now();
  const stubRef = await db.collection("user_todo_assignments").add({
    userId,
    type: "PRODUCTION",
    teacher: "AI Generated",
    totalQuestionCount: DEFAULT_TOTAL,
    completedQuestionCount: 0,
    assignmentDate: todayStr,
    createdAt: now,
  });

  return {
    placement: "TODO",
    assignmentId: stubRef.id,
    type: "PRODUCTION",
    teacher: "AI Generated",
    completedQuestionCount: 0,
    totalQuestionCount: DEFAULT_TOTAL,
  };
});
