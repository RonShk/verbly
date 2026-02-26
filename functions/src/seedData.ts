import * as admin from "firebase-admin";

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

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

async function runSeed(): Promise<void> {
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const userId = "demo_user";

  const todoPayloads = [
    { userId, type: "VOCAB", teacher: "Dr. Aris Thorne", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 2 * 24 * 60 * 60 * 1000)), totalQuestionCount: 12, completedQuestionCount: 8, createdAt: Timestamp.now() },
    { userId, type: "READING VOCAB", teacher: "Prof. Elena Vance", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 1 * 24 * 60 * 60 * 1000)), totalQuestionCount: 5, completedQuestionCount: 0, createdAt: Timestamp.now() },
    { userId, type: "PRODUCTION", teacher: "Dr. Aris Thorne", dueDate: Timestamp.fromDate(weekEnd), totalQuestionCount: 3, completedQuestionCount: 2, createdAt: Timestamp.now() },
    { userId, type: "TRANSLATION", teacher: "Prof. Elena Vance", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 12 * 60 * 60 * 1000)), totalQuestionCount: 1, completedQuestionCount: 0, createdAt: Timestamp.now() },
  ];

  for (const data of todoPayloads) {
    await db.collection("user_todo_assignments").add(data);
  }

  const completedAt1 = new Date(weekStart);
  completedAt1.setUTCDate(completedAt1.getUTCDate() + 1);
  const completedAt2 = new Date(weekStart);
  completedAt2.setUTCDate(completedAt2.getUTCDate() + 2);

  const dueDate1 = new Date(weekStart);
  dueDate1.setUTCDate(dueDate1.getUTCDate() - 2);
  const dueDate2 = new Date(weekStart);
  dueDate2.setUTCDate(dueDate2.getUTCDate() - 1);

  await db.collection("user_completed_assignments").add({
    userId,
    type: "VOCAB",
    teacher: "Dr. Aris Thorne",
    dueDate: Timestamp.fromDate(dueDate1),
    totalQuestionCount: 10,
    completedAt: Timestamp.fromDate(completedAt1),
  });
  await db.collection("user_completed_assignments").add({
    userId,
    type: "READING VOCAB",
    teacher: "Prof. Elena Vance",
    dueDate: Timestamp.fromDate(dueDate2),
    totalQuestionCount: 5,
    completedAt: Timestamp.fromDate(completedAt2),
  });

  console.log("Seed complete. user_todo_assignments: 4, user_completed_assignments: 2");
}

runSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});
