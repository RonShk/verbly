import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

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
  const nowTs = Timestamp.now();

  // Compute today's date string in the user's timezone
  const offsetMs = utcOffsetMinutes * 60_000;
  const clientLocal = new Date(Date.now() + offsetMs);
  const todayStr = clientLocal.toISOString().substring(0, 10);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const [todoSnap, completedSnap, vocabSnap] = await Promise.all([
    db.collection("user_todo_assignments")
      .where("userId", "==", userId)
      .get(),
    db.collection("user_completed_assignments")
      .where("userId", "==", userId)
      .where("assignmentDate", "==", todayStr)
      .get(),
    db.collection("vocab_cards")
      .where("userId", "==", userId)
      .where("due", "<=", nowTs)
      .get(),
  ]);

  // Vocab due count
  const reviewDue = vocabSnap.docs.filter((d) => (d.data().state as number) !== 0).length;
  const newDue = vocabSnap.docs.filter((d) => (d.data().state as number) === 0).length;
  const vocabDueCount = reviewDue + Math.min(newDue, 10);

  // Build sets of which types are completed today and which have active todos
  const completedTypes = new Set<string>();
  const completed: Array<Record<string, unknown>> = [];

  completedSnap.docs.forEach((doc) => {
    const d = doc.data();
    const type = (d.type as string) ?? "";
    completedTypes.add(type);
    completed.push({
      type,
      teacher: (d.teacher as string) ?? "",
      dueDate: "",
      totalQuestionCount: (d.totalQuestionCount as number) ?? 0,
      completedAt: "Today",
      subtitle: `Daily ${type.charAt(0) + type.slice(1).toLowerCase()} • Done today`,
    });
  });

  // Filter today's active todo assignments
  const todayTodos = todoSnap.docs.filter((doc) => {
    const d = doc.data();
    return d.assignmentDate === todayStr;
  });

  const activeTodayTypes = new Set<string>();

  const assignments: Array<Record<string, unknown>> = [];

  // Always add vocab card first
  assignments.push({
    id: "daily-vocab",
    type: "VOCAB",
    teacher: "",
    dueDate: todayLabel,
    totalQuestionCount: vocabDueCount,
    completedQuestionCount: 0,
    buttonLabel: "Start",
  });

  // Add active translation/production assignments for today
  for (const doc of todayTodos) {
    const d = doc.data();
    const type = (d.type as string) ?? "";
    if (completedTypes.has(type)) continue;
    activeTodayTypes.add(type);

    const completedQuestionCount = (d.completedQuestionCount as number) ?? 0;
    assignments.push({
      id: `daily-${type.toLowerCase()}`,
      type,
      teacher: (d.teacher as string) ?? "AI Generated",
      dueDate: todayLabel,
      totalQuestionCount: (d.totalQuestionCount as number) ?? 10,
      completedQuestionCount,
      buttonLabel: completedQuestionCount > 0 ? "Continue" : "Start",
    });
  }

  // Add cards for types not yet started or completed today
  for (const type of ["TRANSLATION", "PRODUCTION"]) {
    if (!completedTypes.has(type) && !activeTodayTypes.has(type)) {
      assignments.push({
        id: `daily-${type.toLowerCase()}`,
        type,
        teacher: "AI Generated",
        dueDate: todayLabel,
        totalQuestionCount: 10,
        completedQuestionCount: 0,
        buttonLabel: "Start",
      });
    }
  }

  return {
    assignments,
    completed,
  };
});
