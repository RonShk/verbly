import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

export const getHomePageData = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required and must be a string."
    );
  }

  const utcOffsetMinutes = typeof data?.timezoneOffsetMinutes === "number" ? data.timezoneOffsetMinutes : -(new Date().getTimezoneOffset());

  const db = admin.firestore();

  const offsetMs = utcOffsetMinutes * 60_000;
  const clientLocal = new Date(Date.now() + offsetMs);
  const todayStr = clientLocal.toISOString().substring(0, 10);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const [todoSnap, completedSnap] = await Promise.all([
    db.collection("user_todo_assignments")
      .where("userId", "==", userId)
      .get(),
    db.collection("user_completed_assignments")
      .where("userId", "==", userId)
      .where("assignmentDate", "==", todayStr)
      .get(),
  ]);

  // --- Active assignments first (they take priority over completed) ---
  const todayTodos = todoSnap.docs.filter((doc) => doc.data().assignmentDate === todayStr);
  const activeTodayTypes = new Set<string>();
  const assignments: Array<Record<string, unknown>> = [];

  for (const doc of todayTodos) {
    const d = doc.data();
    const type = (d.type as string) ?? "";
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

  for (const type of ["TRANSLATION", "PRODUCTION"]) {
    if (!activeTodayTypes.has(type)) {
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

  // --- Completed assignments (only if no active todo exists for that type) ---
  const completed: Array<Record<string, unknown>> = [];

  completedSnap.docs.forEach((doc) => {
    const d = doc.data();
    const type = (d.type as string) ?? "";
    if (activeTodayTypes.has(type)) return;
    completed.push({
      type,
      teacher: (d.teacher as string) ?? "",
      dueDate: "",
      totalQuestionCount: (d.totalQuestionCount as number) ?? 0,
      completedAt: "Today",
      subtitle: "",
    });
  });

  return { assignments, completed };
});
