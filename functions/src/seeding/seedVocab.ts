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
import { getWeekBounds } from "../utils/getWeekBounds";

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

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

/** Fisher–Yates shuffle (returns a new array). */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function runSeedVocab(): Promise<void> {
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const userId = "demo_user";
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);

  // 1. Create the vocab_lists doc (source word pairs)
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

  // 2. Pre-shuffle words once and store in vocab_question_sets
  const shuffled = shuffle(SPANISH_VOCAB_WORDS);
  const questions = shuffled.map((w, i) => ({
    index: i,
    learningLanguageWord: w.learningLanguageWord,
    englishWord: w.englishWord,
  }));

  const questionSetRef = await db.collection("vocab_question_sets").add({
    userId,
    vocabListId,
    learningLanguage: "es",
    weekStart: weekStartTs,
    questions,
    createdAt: Timestamp.now(),
  });

  const questionSetId = questionSetRef.id;
  console.log("Created vocab_question_sets doc:", questionSetId);

  // 3. Find existing VOCAB assignment for this user/week, or create one
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
      questionSetId,
      totalQuestionCount,
    });
    console.log("Updated existing VOCAB assignment:", doc.id);
  } else {
    const newAssignmentRef = await db.collection("user_todo_assignments").add({
      userId,
      type: "VOCAB",
      teacher: "Dr. Aris Thorne",
      dueDate: vocabDueDate,
      totalQuestionCount,
      completedQuestionCount: 0,
      vocabListId,
      questionSetId,
      createdAt: Timestamp.now(),
    });
    console.log("Created new VOCAB assignment:", newAssignmentRef.id);
  }

  console.log("Seed vocab complete. vocab_lists: 1, vocab_question_sets: 1, assignment linked.");
}

runSeedVocab().catch((e) => {
  console.error(e);
  process.exit(1);
});
