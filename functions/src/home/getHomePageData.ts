import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

function getWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() + mondayOffset);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function formatWeekRangeLabel(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} - ${end.toLocaleDateString("en-US", opts)}`;
}

export const getHomePageData = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required and must be a string."
    );
  }

  const db = admin.firestore();
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);

  const [assignmentsSnap, progressSnap, completionsSnap] = await Promise.all([
    db.collection("assignments")
      .where("dueDate", ">=", weekStartTs) 
      .where("dueDate", "<=", weekEndTs)
      .get(),
    db.collection("user_progress").where("userId", "==", userId).get(),
    db.collection("completions")
      .where("userId", "==", userId)
      .where("completedAt", ">=", weekStartTs)
      .where("completedAt", "<=", weekEndTs)
      .orderBy("completedAt", "desc")
      .get(),
  ]);

  const progressByAssignmentId = new Map<string, number>();
  progressSnap.docs.forEach((doc) => {
    const d = doc.data();
    const aid = d.assignmentId as string;
    const count = (d.completedCount as number) ?? 0;
    progressByAssignmentId.set(aid, count);
  });

  const completedAssignmentIds = new Set(
    completionsSnap.docs.map((doc) => doc.data().assignmentId as string)
  );

  const assignments: Array<{
    id: string;
    type: string;
    title: string;
    teacher: string;
    dueDate: string;
    total: number;
    progressLabel: string;
    completedCount: number;
    buttonLabel: string;
  }> = [];
  let remainingCount = 0;

  assignmentsSnap.docs.forEach((doc) => {
    const d = doc.data();
    const id = doc.id;
    const total = (d.total as number) ?? 0;
    const completedCount = progressByAssignmentId.get(id) ?? 0;
    const isCompleted = completedAssignmentIds.has(id);
    if (!isCompleted) remainingCount += 1;

    const dueDate = d.dueDate?.toDate?.() as Date | undefined;
    const dueLabel = dueDate
      ? dueDate.toLocaleDateString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })
      : "";

    assignments.push({
      id,
      type: (d.type as string) ?? "",
      title: (d.title as string) ?? "",
      teacher: (d.teacher as string) ?? "",
      dueDate: dueLabel,
      total,
      progressLabel: (d.progressLabel as string) ?? "",
      completedCount,
      buttonLabel: completedCount === 0 ? "Start" : "Continue",
    });
  });

  const completed = completionsSnap.docs.map((doc) => {
    const d = doc.data();
    const completedAt = d.completedAt?.toDate?.() as Date | undefined;
    const completedLabel = completedAt
      ? completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    return {
      assignmentId: d.assignmentId as string,
      assignmentTitle: (d.assignmentTitle as string) ?? "",
      teacherName: (d.teacherName as string) ?? "",
      score: (d.score as number) ?? 0,
      completedAt: completedLabel,
      subtitle: `Assigned by ${d.teacherName ?? ""} • Completed ${completedLabel}`,
    };
  });

  let avgScore = 0;
  if (completed.length > 0) {
    const sum = completed.reduce((acc, c) => acc + c.score, 0);
    avgScore = Math.round(sum / completed.length);
  }

  const weeklySummary = {
    remainingCount,
    totalCount: assignments.length,
    avgScore,
  };

  const weekRange = {
    start: weekStart.toISOString().slice(0, 10),
    end: weekEnd.toISOString().slice(0, 10),
    label: formatWeekRangeLabel(weekStart, weekEnd),
  };

  return {
    weeklySummary,
    weekRange,
    assignments,
    completed,
  };
});
