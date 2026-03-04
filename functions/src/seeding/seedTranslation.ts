/**
 * Seeds a TRANSLATION assignment by calling Gemini to generate
 * Spanish sentences that students must translate into English.
 *
 * Run from project root:
 *   cd functions && npm run seed:translation
 *
 * Requires GEMINI_API_KEY in functions/.env (loaded via dotenv).
 */
import "dotenv/config";
import * as admin from "firebase-admin";
import { z } from "zod";
import { generateStructured } from "../ai/geminiClient";
import { getWeekBounds } from "../utils/getWeekBounds";

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

const SPANISH_VOCAB_WORDS: Array<{
  learningLanguageWord: string;
  englishWord: string;
}> = [
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

const TranslationQuestionSchema = z.object({
  sentenceInLearningLanguage: z.string(),
  vocabWordsUsed: z.array(z.string()),
});

const TranslationResponseSchema = z.object({
  questions: z.array(TranslationQuestionSchema),
});

async function runSeedTranslation(): Promise<void> {
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const userId = "demo_user";
  const weekStartTs = Timestamp.fromDate(weekStart);

  // 1. Find or create the vocab_lists doc
  const existingLists = await db
    .collection("vocab_lists")
    .where("userId", "==", userId)
    .where("weekStart", "==", weekStartTs)
    .limit(1)
    .get();

  let vocabListId: string;
  if (!existingLists.empty) {
    vocabListId = existingLists.docs[0].id;
    console.log("Using existing vocab_lists doc:", vocabListId);
  } else {
    const ref = await db.collection("vocab_lists").add({
      userId,
      learningLanguage: "es",
      words: SPANISH_VOCAB_WORDS,
      weekStart: weekStartTs,
      createdAt: Timestamp.now(),
    });
    vocabListId = ref.id;
    console.log("Created vocab_lists doc:", vocabListId);
  }

  // 2. Generate translation questions via Gemini (Spanish sentences → student translates to English)
  const wordPairs = SPANISH_VOCAB_WORDS.map(
    (w) => `${w.learningLanguageWord} (${w.englishWord})`
  ).join(", ");

  const prompt = `You are a Spanish teacher creating translation practice (Spanish to English).

Given these Spanish-English vocabulary pairs: ${wordPairs}

Generate ${SPANISH_VOCAB_WORDS.length} Spanish sentences that a student must translate into English. Each sentence should use 1-3 of the given Spanish vocabulary words in a natural context.

Sentences should:
- Be written in natural Spanish
- Range from simple to moderately complex
- Provide real-world context (formal introductions, business, daily life, etc.)

Return a JSON object with a "questions" array. Each item must have:
- "sentenceInLearningLanguage": the Spanish sentence to translate
- "vocabWordsUsed": array of the Spanish vocabulary words that appear in this sentence`;

  console.log("Calling Gemini to generate translation questions...");
  const result = await generateStructured(prompt, TranslationResponseSchema);

  const questions = result.questions.map((q, i) => ({
    index: i,
    sentenceInLearningLanguage: q.sentenceInLearningLanguage,
    vocabWordsUsed: q.vocabWordsUsed,
    studentAnswer: null,
    aiEvaluation: null,
  }));

  console.log(`Gemini generated ${questions.length} questions`);

  // 3. Store in translation_question_sets
  const questionSetRef = await db.collection("translation_question_sets").add({
    userId,
    vocabListId,
    learningLanguage: "es",
    weekStart: weekStartTs,
    questions,
    createdAt: Timestamp.now(),
  });

  const questionSetId = questionSetRef.id;
  const totalQuestionCount = questions.length;
  console.log("Created translation_question_sets doc:", questionSetId);

  // 4. Find existing TRANSLATION assignment for this user/week, or create one
  const weekEndTs = Timestamp.fromDate(weekEnd);
  const todoSnap = await db
    .collection("user_todo_assignments")
    .where("userId", "==", userId)
    .where("type", "==", "TRANSLATION")
    .where("dueDate", ">=", weekStartTs)
    .where("dueDate", "<=", weekEndTs)
    .get();

  const translationDueDate = Timestamp.fromDate(weekEnd);

  if (!todoSnap.empty) {
    const doc = todoSnap.docs[0];
    await doc.ref.update({
      vocabListId,
      questionSetId,
      totalQuestionCount,
      completedQuestionCount: 0,
    });
    console.log("Updated existing TRANSLATION assignment:", doc.id);
  } else {
    const newRef = await db.collection("user_todo_assignments").add({
      userId,
      type: "TRANSLATION",
      teacher: "Prof. Elena Vance",
      dueDate: translationDueDate,
      totalQuestionCount,
      completedQuestionCount: 0,
      vocabListId,
      questionSetId,
      createdAt: Timestamp.now(),
    });
    console.log("Created new TRANSLATION assignment:", newRef.id);
  }

  console.log(
    "Seed translation complete. translation_question_sets: 1, assignment linked."
  );
}

runSeedTranslation().catch((e) => {
  console.error(e);
  process.exit(1);
});
