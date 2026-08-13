import * as admin from "firebase-admin";
import {Timestamp, type QueryDocumentSnapshot} from "firebase-admin/firestore";
import {type SessionType} from "../core/sessionModes";
import {ASSIGNMENTS_COLLECTION} from "../core/assignmentRefs";
import {getTodayDateString} from "../../../../utils/localDate";

export const DEFAULT_TOTAL = 10;

export type CompletionStatus = "TODO" | "COMPLETED";

export {getTodayDateString};

function createdAtMillis(doc: QueryDocumentSnapshot): number {
  const ts = doc.data().createdAt;
  return ts instanceof Timestamp ? ts.toMillis() : 0;
}

/** Shape returned to the client for a daily sentence-practice status. */
export interface DailySessionStatus {
  completionStatus: CompletionStatus;
  assignmentId: string | null;
  type: SessionType;
  teacher: string;
  completedQuestionCount: number;
  totalQuestionCount: number;
  cumulativeOffsetQuestionCount: number;
}

/**
 * Stub-only lookup for today's assignment status of a given mode, over the
 * unified `user_assignments` collection. Does NOT generate questions.
 *
 * Resolution order:
 *  1. Active (completionStatus != COMPLETED) doc for today → return it. A wave-2+
 *     "Continue review" doc still hidden from the ASSIGNMENTS list reports
 *     completionStatus=COMPLETED until the first answer.
 *  2. Else completed doc(s) for today → completionStatus=COMPLETED with cumulative
 *     offset (sum of completed totals).
 *  3. Else create an empty stub (completionStatus=TODO, no generationStatus) and return it.
 */
export async function resolveDailySessionStatus(userId: string, type: SessionType, timezoneOffsetMinutes: number): Promise<DailySessionStatus> {
  const todayStr = getTodayDateString(timezoneOffsetMinutes);
  const col = admin.firestore().collection(ASSIGNMENTS_COLLECTION);
  const snap = await col
    .where("userId", "==", userId)
    .where("type", "==", type)
    .where("assignmentDate", "==", todayStr)
    .get();

  const activeDocs = snap.docs.filter((d) => d.data().completionStatus !== "COMPLETED");
  const completedDocs = snap.docs.filter((d) => d.data().completionStatus === "COMPLETED");

  if (activeDocs.length > 0) {
    const doc = activeDocs.sort((a, b) => createdAtMillis(b) - createdAtMillis(a))[0];
    const d = doc.data();
    const completed = (d.completedQuestionCount as number) ?? 0;
    const hideUntilFirstProgress = (d.hideFromAssignmentsTabUntilFirstProgress as boolean | undefined) ?? false;
    const completionStatus: CompletionStatus = (hideUntilFirstProgress && completed === 0) ? "COMPLETED" : "TODO";
    return {
      completionStatus,
      assignmentId: doc.id,
      type,
      teacher: (d.teacher as string) ?? "AI Generated",
      completedQuestionCount: completed,
      totalQuestionCount: (d.totalQuestionCount as number) ?? DEFAULT_TOTAL,
      cumulativeOffsetQuestionCount: (d.cumulativeOffsetQuestionCount as number | undefined) ?? 0,
    };
  }

  if (completedDocs.length > 0) {
    let cumulativeTotal = 0;
    let teacher = "AI Generated";
    for (const d of completedDocs) {
      const data = d.data();
      cumulativeTotal += (data.totalQuestionCount as number) ?? 0;
      teacher = (data.teacher as string) ?? teacher;
    }
    const lastTotal = (completedDocs[completedDocs.length - 1].data().totalQuestionCount as number) ?? DEFAULT_TOTAL;
    return {
      completionStatus: "COMPLETED",
      assignmentId: null,
      type,
      teacher,
      completedQuestionCount: lastTotal,
      totalQuestionCount: lastTotal,
      cumulativeOffsetQuestionCount: cumulativeTotal,
    };
  }

  const stubRef = await col.add({
    userId,
    type,
    teacher: "AI Generated",
    completionStatus: "TODO",
    totalQuestionCount: DEFAULT_TOTAL,
    completedQuestionCount: 0,
    assignmentDate: todayStr,
    createdAt: Timestamp.now(),
  });
  return {
    completionStatus: "TODO",
    assignmentId: stubRef.id,
    type,
    teacher: "AI Generated",
    completedQuestionCount: 0,
    totalQuestionCount: DEFAULT_TOTAL,
    cumulativeOffsetQuestionCount: 0,
  };
}

/**
 * Creates (or returns) a "Continue review" wave for today over the unified
 * collection. Reuses an existing active todo if present; otherwise creates a
 * new assignment doc whose cumulative offset is the sum of today's completed
 * totals, hidden from the ASSIGNMENTS list until the first answer.
 */
export async function prepareContinueReviewWave(userId: string, type: SessionType, timezoneOffsetMinutes: number): Promise<{assignmentId: string; cumulativeOffsetQuestionCount: number; totalQuestionCount: number}> {
  const todayStr = getTodayDateString(timezoneOffsetMinutes);
  const col = admin.firestore().collection(ASSIGNMENTS_COLLECTION);
  const snap = await col
    .where("userId", "==", userId)
    .where("type", "==", type)
    .where("assignmentDate", "==", todayStr)
    .get();

  const activeDoc = snap.docs.find((d) => d.data().completionStatus !== "COMPLETED");
  if (activeDoc) {
    const d = activeDoc.data();
    return {
      assignmentId: activeDoc.id,
      cumulativeOffsetQuestionCount: (d.cumulativeOffsetQuestionCount as number | undefined) ?? 0,
      totalQuestionCount: (d.totalQuestionCount as number | undefined) ?? DEFAULT_TOTAL,
    };
  }

  let cumulativeOffset = 0;
  for (const d of snap.docs) {
    if (d.data().completionStatus === "COMPLETED") cumulativeOffset += (d.data().totalQuestionCount as number) ?? 0;
  }

  const todoRef = await col.add({
    userId,
    type,
    teacher: "AI Generated",
    completionStatus: "TODO",
    totalQuestionCount: DEFAULT_TOTAL,
    completedQuestionCount: 0,
    cumulativeOffsetQuestionCount: cumulativeOffset,
    hideFromAssignmentsTabUntilFirstProgress: true,
    assignmentDate: todayStr,
    createdAt: Timestamp.now(),
  });

  return {assignmentId: todoRef.id, cumulativeOffsetQuestionCount: cumulativeOffset, totalQuestionCount: DEFAULT_TOTAL};
}
