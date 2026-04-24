import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";

const db = admin.firestore();

const DEFAULT_TOTAL = 10;

function getTodayDateString(utcOffsetMinutes: number): string {
  const offsetMs = utcOffsetMinutes * 60_000;
  const clientLocal = new Date(Date.now() + offsetMs);
  return clientLocal.toISOString().substring(0, 10);
}

/**
 * Creates (or returns) a "Continue review" wave for today's Production.
 *
 * Called from Home when the user taps "Continue review" on a completed
 * Production row. The newly-created todo:
 *   - has cumulativeOffsetQuestionCount = sum of today's completed totals
 *   - has hideFromAssignmentsTabUntilFirstProgress=true so the row remains
 *     under COMPLETED on Home until the user answers a question
 *   - has no questionSetId yet — `startProductionSession` will run AI
 *     generation on first open (and is idempotent on subsequent opens).
 *
 * Idempotent: if a todo for today/PRODUCTION already exists, returns that
 * doc id instead of creating a duplicate.
 */
export const prepareProductionContinueReview = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    }

    const userId = data?.userId;
    const timezoneOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : -(new Date().getTimezoneOffset());

    if (!userId || typeof userId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "userId is required."
      );
    }

    const todayStr = getTodayDateString(timezoneOffsetMinutes);

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
        assignmentId: doc.id,
        cumulativeOffsetQuestionCount: (d.cumulativeOffsetQuestionCount as number | undefined) ?? 0,
        totalQuestionCount: (d.totalQuestionCount as number | undefined) ?? DEFAULT_TOTAL,
      };
    }

    const completedSnap = await db.collection("user_completed_assignments")
      .where("userId", "==", userId)
      .where("type", "==", "PRODUCTION")
      .where("assignmentDate", "==", todayStr)
      .get();

    let cumulativeOffset = 0;
    for (const d of completedSnap.docs) {
      cumulativeOffset += (d.data().totalQuestionCount as number) ?? 0;
    }

    const now = Timestamp.now();
    const todoRef = await db.collection("user_todo_assignments").add({
      userId,
      type: "PRODUCTION",
      teacher: "AI Generated",
      totalQuestionCount: DEFAULT_TOTAL,
      completedQuestionCount: 0,
      cumulativeOffsetQuestionCount: cumulativeOffset,
      hideFromAssignmentsTabUntilFirstProgress: true,
      assignmentDate: todayStr,
      createdAt: now,
    });

    return {
      assignmentId: todoRef.id,
      cumulativeOffsetQuestionCount: cumulativeOffset,
      totalQuestionCount: DEFAULT_TOTAL,
    };
  }
);
