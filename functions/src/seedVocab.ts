/**
 * Seeds the vocab_lists collection with Spanish words and links the VOCAB
 * assignment for the demo user to that list.
 *
 * Run from project root against emulator or real Firestore:
 *   cd functions && npm run seed:vocab
 * Ensure Firebase is initialized (e.g. GOOGLE_APPLICATION_CREDENTIALS or
 * gcloud auth application-default login).
 */
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

/** Spanish (learning language) → English vocab pairs for demo. */
const SPANISH_VOCAB_WORDS: Array<{ learningLanguageWord: string; englishWord: string }> = [
  { learningLanguageWord: "hola", englishWord: "hello" },
  { learningLanguageWord: "adiós", englishWord: "goodbye" },
  { learningLanguageWord: "gracias", englishWord: "thank you" },
  { learningLanguageWord: "por favor", englishWord: "please" },
  { learningLanguageWord: "sí", englishWord: "yes" },
  { learningLanguageWord: "no", englishWord: "no" },
  { learningLanguageWord: "agua", englishWord: "water" },
  { learningLanguageWord: "comida", englishWord: "food" },
  { learningLanguageWord: "casa", englishWord: "house" },
  { learningLanguageWord: "libro", englishWord: "book" },
  { learningLanguageWord: "amigo", englishWord: "friend" },
  { learningLanguageWord: "tiempo", englishWord: "time" },
];

async function runSeedVocab(): Promise<void> {
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const userId = "demo_user";
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);

  // 1. One vocab_lists document per user (auto-generated ID)
  const vocabListRef = await db.collection("vocab_lists").add({
    userId,
    learningLanguage: "es",
    words: SPANISH_VOCAB_WORDS,
    weekStart: weekStartTs,
    createdAt: Timestamp.now(),
  });

  const vocabListId = vocabListRef.id;
  const totalQuestionCount = SPANISH_VOCAB_WORDS.length;
  console.log("Created vocab_lists doc:", vocabListId, "with", totalQuestionCount, "words");

  // 2. Find existing VOCAB assignment for this user in this week, or create one
  const todoSnap = await db
    .collection("user_todo_assignments")
    .where("userId", "==", userId)
    .where("type", "==", "VOCAB")
    .where("dueDate", ">=", weekStartTs)
    .where("dueDate", "<=", weekEndTs)
    .get();

  const vocabDueDate = Timestamp.fromDate(
    new Date(weekEnd.getTime() - 2 * 24 * 60 * 60 * 1000)
  );

  if (!todoSnap.empty) {
    const doc = todoSnap.docs[0];
    await doc.ref.update({
      vocabListId,
      totalQuestionCount,
      // Keep existing completedQuestionCount; if you want to reset progress, set completedQuestionCount: 0
    });
    console.log("Updated existing VOCAB assignment:", doc.id, "with vocabListId:", vocabListId);
  } else {
    const newAssignmentRef = await db.collection("user_todo_assignments").add({
      userId,
      type: "VOCAB",
      teacher: "Dr. Aris Thorne",
      dueDate: vocabDueDate,
      totalQuestionCount,
      completedQuestionCount: 0,
      vocabListId,
      createdAt: Timestamp.now(),
    });
    console.log("Created new VOCAB assignment:", newAssignmentRef.id, "with vocabListId:", vocabListId);
  }

  console.log("Seed vocab complete. vocab_lists: 1 doc, VOCAB assignment linked.");
}

runSeedVocab().catch((e) => {
  console.error(e);
  process.exit(1);
});
