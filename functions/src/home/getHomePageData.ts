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

  const [todoSnap, completedSnap] = await Promise.all([
    db
      .collection("user_todo_assignments")
      .where("userId", "==", userId)
      .where("dueDate", ">=", weekStartTs)
      .where("dueDate", "<=", weekEndTs)
      .get(),
    db
      .collection("user_completed_assignments")
      .where("userId", "==", userId)
      .where("completedAt", ">=", weekStartTs)
      .where("completedAt", "<=", weekEndTs)
      .orderBy("completedAt", "desc")
      .get(),
  ]);

  const assignments: Array<{
    id: string;
    type: string;
    teacher: string;
    dueDate: string;
    totalQuestionCount: number;
    completedQuestionCount: number;
    buttonLabel: string;
  }> = [];

  todoSnap.docs.forEach((doc) => {
    const d = doc.data();
    const dueDate = d.dueDate?.toDate?.() as Date | undefined;
    const dueLabel = dueDate
      ? dueDate.toLocaleDateString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })
      : "";
    const completedQuestionCount = (d.completedQuestionCount as number) ?? 0;
    assignments.push({
      id: doc.id,
      type: (d.type as string) ?? "",
      teacher: (d.teacher as string) ?? "",
      dueDate: dueLabel,
      totalQuestionCount: (d.totalQuestionCount as number) ?? 0,
      completedQuestionCount,
      buttonLabel: completedQuestionCount === 0 ? "Start" : "Continue",
    });
  });

  const completed = completedSnap.docs.map((doc) => {
    const d = doc.data();
    const completedAt = d.completedAt?.toDate?.() as Date | undefined;
    const completedLabel = completedAt
      ? completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    const dueDate = d.dueDate?.toDate?.() as Date | undefined;
    const dueLabel = dueDate
      ? dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";
    const teacher = (d.teacher as string) ?? "";
    return {
      type: (d.type as string) ?? "",
      teacher,
      dueDate: dueLabel,
      totalQuestionCount: (d.totalQuestionCount as number) ?? 0,
      completedAt: completedLabel,
      subtitle: `Assigned by ${teacher} • Completed ${completedLabel}`,
    };
  });

  const weeklySummary = {
    remainingCount: assignments.length,
    totalCount: assignments.length,
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
