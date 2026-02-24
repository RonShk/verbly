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
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

async function runSeed(): Promise<void> {
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const userId = "demo_user";

  const assignmentPayloads = [
    { type: "VOCAB", title: "Academic Lexicon Unit 5", teacher: "Dr. Aris Thorne", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 2 * 24 * 60 * 60 * 1000)), total: 12, progressLabel: "cards" },
    { type: "READING VOCAB", title: "Scientific Journal Excerpts", teacher: "Prof. Elena Vance", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 1 * 24 * 60 * 60 * 1000)), total: 5, progressLabel: "passages" },
    { type: "PRODUCTION", title: "Essay: Climate Impact", teacher: "Dr. Aris Thorne", dueDate: Timestamp.fromDate(weekEnd), total: 3, progressLabel: "sections" },
    { type: "TRANSLATION", title: "Legal Document Draft", teacher: "Prof. Elena Vance", dueDate: Timestamp.fromDate(new Date(weekEnd.getTime() - 12 * 60 * 60 * 1000)), total: 1, progressLabel: "documents" },
  ];

  const assignmentIds: string[] = [];
  for (const data of assignmentPayloads) {
    const ref = await db.collection("assignments").add(data);
    assignmentIds.push(ref.id);
  }

  await db.collection("user_progress").add({
    userId,
    assignmentId: assignmentIds[0],
    completedCount: 8,
    updatedAt: Timestamp.now(),
  });
  await db.collection("user_progress").add({
    userId,
    assignmentId: assignmentIds[2],
    completedCount: 2,
    updatedAt: Timestamp.now(),
  });

  const completedAt1 = new Date(weekStart);
  completedAt1.setUTCDate(completedAt1.getUTCDate() - 2);
  const completedAt2 = new Date(weekStart);
  completedAt2.setUTCDate(completedAt2.getUTCDate() - 3);

  const pastAssignmentPayloads = [
    { type: "VOCAB", title: "Vocab: Medical Terms", teacher: "Dr. Aris Thorne", dueDate: Timestamp.fromDate(completedAt1), total: 10, progressLabel: "cards" },
    { type: "READING VOCAB", title: "Reading Vocab: Economic News", teacher: "Prof. Elena Vance", dueDate: Timestamp.fromDate(completedAt2), total: 5, progressLabel: "passages" },
  ];
  const pastRef1 = await db.collection("assignments").add(pastAssignmentPayloads[0]);
  const pastRef2 = await db.collection("assignments").add(pastAssignmentPayloads[1]);

  await db.collection("completions").add({
    userId,
    assignmentId: pastRef1.id,
    assignmentTitle: "Vocab: Medical Terms",
    teacherName: "Dr. Aris Thorne",
    score: 98,
    completedAt: Timestamp.fromDate(completedAt1),
  });
  await db.collection("completions").add({
    userId,
    assignmentId: pastRef2.id,
    assignmentTitle: "Reading Vocab: Economic News",
    teacherName: "Prof. Elena Vance",
    score: 85,
    completedAt: Timestamp.fromDate(completedAt2),
  });

  console.log("Seed complete. Assignments:", assignmentIds.length + 2, "(4 this week + 2 completed)");
}

runSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});

