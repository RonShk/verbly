import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { getVocabDueInfo } from "../utils/getVocabDueInfo";

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

  const [todoSnap, completedSnap, vocabInfo] = await Promise.all([
    db.collection("user_todo_assignments")
      .where("userId", "==", userId)
      .get(),
    db.collection("user_completed_assignments")
      .where("userId", "==", userId)
      .where("assignmentDate", "==", todayStr)
      .get(),
    getVocabDueInfo(userId, utcOffsetMinutes),
  ]);

  // --- Completed assignments today ---
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
      subtitle: `Daily ${type.charAt(0) + type.slice(1).toLowerCase()} \u2022 Done today`,
    });
  });

  // --- Active assignments ---
  const todayTodos = todoSnap.docs.filter((doc) => doc.data().assignmentDate === todayStr);
  const activeTodayTypes = new Set<string>();
  const assignments: Array<Record<string, unknown>> = [];

  // Vocab
  if (vocabInfo.dueCount > 0) {
    assignments.push({
      id: "daily-vocab",
      type: "VOCAB",
      teacher: "",
      dueDate: todayLabel,
      totalQuestionCount: vocabInfo.dueCount,
      completedQuestionCount: 0,
      buttonLabel: "Start",
    });
  } else if (vocabInfo.hasCards) {
    completed.push({
      type: "VOCAB",
      teacher: "",
      dueDate: "",
      totalQuestionCount: 0,
      completedAt: "Today",
      subtitle: "Daily Vocab \u2022 Done today",
    });
  }

  // Translation / Production
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

  return { assignments, completed };
});
