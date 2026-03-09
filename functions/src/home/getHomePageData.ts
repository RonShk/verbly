import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getWeekBounds } from "../utils/getWeekBounds";

export const getHomePageData = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required and must be a string."
    );
  }

  const utcOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes: -(new Date().getTimezoneOffset());

  const db = admin.firestore();
  const { start: weekStart, end: weekEnd } = getWeekBounds(utcOffsetMinutes);
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);
  const nowTs = Timestamp.now();

  const [todoSnap, completedSnap, vocabSnap] = await Promise.all([
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
    db
      .collection("vocab_cards")
      .where("userId", "==", userId)
      .where("due", "<=", nowTs)
      .get(),
  ]);

  const reviewDue = vocabSnap.docs.filter((d) => (d.data().state as number) !== 0).length;
  const newDue = vocabSnap.docs.filter((d) => (d.data().state as number) === 0).length;
  const vocabDueCount = reviewDue + Math.min(newDue, 10);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const assignments: Array<{
    id: string;
    type: string;
    teacher: string;
    dueDate: string;
    totalQuestionCount: number;
    completedQuestionCount: number;
    buttonLabel: string;
  }> = [];

  assignments.push({
    id: "daily-vocab",
    type: "VOCAB",
    teacher: "",
    dueDate: todayLabel,
    totalQuestionCount: vocabDueCount,
    completedQuestionCount: 0,
    buttonLabel: vocabDueCount === 0 ? "Start" : "Start",
  });

  todoSnap.docs.forEach((doc) => {
    const d = doc.data();
    const dueDate = d.dueDate?.toDate?.() as Date | undefined;
    const dueLabel = dueDate
      ? dueDate.toLocaleDateString("en-US", {
          weekday: "long",
          hour: "numeric",
          minute: "2-digit",
        })
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

  return {
    assignments,
    completed,
  };
});
