import * as admin from "firebase-admin";
import {getWeekBounds} from "../utils/getWeekBounds";

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

async function runSeed(): Promise<void> {
  const {start: weekStart, end: weekEnd} = getWeekBounds();
  const userId = "demo_user";

  const todoPayloads = [
    {userId, type: "VOCAB", teacher: "Dr. Aris Thorne", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 2 * 24 * 60 * 60 * 1000)), totalQuestionCount: 12, completedQuestionCount: 8, vocabListId: "", questionSetId: "", createdAt: Timestamp.now()},
    {userId, type: "PRODUCTION", teacher: "Dr. Aris Thorne", dueDate: Timestamp.fromDate(weekEnd), totalQuestionCount: 3, completedQuestionCount: 2, vocabListId: "", questionSetId: "", createdAt: Timestamp.now()},
    {userId, type: "TRANSLATION", teacher: "Prof. Elena Vance", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 12 * 60 * 60 * 1000)), totalQuestionCount: 1, completedQuestionCount: 0, vocabListId: "", questionSetId: "", createdAt: Timestamp.now()},
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

  console.log("Seed complete. user_todo_assignments: 3, user_completed_assignments: 1");
}

runSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});
