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
 *  1. If there is a todo doc for today/PRODUCTION, return it (placement
 *     depends on whether it's a "Continue review" wave still hidden from
 *     the ASSIGNMENTS list — see [hideFromAssignmentsTabUntilFirstProgress]).
 *  2. Else if there is a completed doc for today/PRODUCTION, return
 *     placement=COMPLETED with cumulative offset (sum of completed totals).
 *  3. Else create an empty stub todo doc (no questionSetId, 0/10) and return it.
 *
 * Cumulative offset semantics:
 *  - For a wave-2+ todo: read [cumulativeOffsetQuestionCount] off the doc.
 *  - For completed-only: sum of all today's completed totals (so the Home
 *    can later show e.g. "20/10" once a 3rd wave begins).
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
    const completed = (d.completedQuestionCount as number) ?? 0;
    const hideUntilFirstProgress = (d.hideFromAssignmentsTabUntilFirstProgress as boolean | undefined) ?? false;
    const cumulativeOffset = (d.cumulativeOffsetQuestionCount as number | undefined) ?? 0;
    const placement = (hideUntilFirstProgress && completed === 0) ? "COMPLETED" : "TODO";
    return {
      placement,
      assignmentId: doc.id,
      type: "PRODUCTION",
      teacher: (d.teacher as string) ?? "AI Generated",
      completedQuestionCount: completed,
      totalQuestionCount: (d.totalQuestionCount as number) ?? DEFAULT_TOTAL,
      cumulativeOffsetQuestionCount: cumulativeOffset,
    };
  }

  const completedSnap = await db.collection("user_completed_assignments")
    .where("userId", "==", userId)
    .where("type", "==", "PRODUCTION")
    .where("assignmentDate", "==", todayStr)
    .get();

  if (!completedSnap.empty) {
    let cumulativeTotal = 0;
    let teacher = "AI Generated";
    for (const d of completedSnap.docs) {
      const data = d.data();
      cumulativeTotal += (data.totalQuestionCount as number) ?? 0;
      teacher = (data.teacher as string) ?? teacher;
    }
    const lastTotal = (completedSnap.docs[completedSnap.docs.length - 1].data().totalQuestionCount as number) ?? DEFAULT_TOTAL;
    return {
      placement: "COMPLETED",
      assignmentId: null,
      type: "PRODUCTION",
      teacher,
      completedQuestionCount: lastTotal,
      totalQuestionCount: lastTotal,
      cumulativeOffsetQuestionCount: cumulativeTotal,
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
    cumulativeOffsetQuestionCount: 0,
  };
});
