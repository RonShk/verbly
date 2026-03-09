/**
 * Finds the existing vocab_lists doc for demo_user this week and generates
 * AI-backed question sets + assignments for TRANSLATION and PRODUCTION.
 * Run after seedVocab (or after the teacher uploads a list).
 *
 *   cd functions && npm run seed:all-from-vocab
 *
 * Requires GEMINI_API_KEY in functions/.env (loaded via dotenv).
 */
import "dotenv/config";
import * as admin from "firebase-admin";
import { z } from "zod";
import { generateStructured } from "../ai/geminiClient";
import { getWeekBounds } from "../utils/getWeekBounds";
import { ProductionPrompts } from "../assignments/production/prompts";
import { TranslationPrompts } from "../assignments/translation/prompts";

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

type VocabWord = { learningLanguageWord: string; englishWord: string };

// ── Zod schemas ────────────────────────────────────────────────────────
const prodDescriptions = ProductionPrompts.descriptions.generate;
const ProductionQuestionSchema = z.object({
  sentenceInNativeLanguage: z.string().describe(prodDescriptions.sentenceInNativeLanguage),
  vocabWordsUsed: z.array(z.string()).describe(prodDescriptions.vocabWordsUsed),
});
const ProductionResponseSchema = z.object({ questions: z.array(ProductionQuestionSchema) });

const transDescriptions = TranslationPrompts.descriptions.generate;
const TranslationQuestionSchema = z.object({
  sentenceInLearningLanguage: z.string().describe(transDescriptions.sentenceInLearningLanguage),
  vocabWordsUsed: z.array(z.string()).describe(transDescriptions.vocabWordsUsed),
});
const TranslationResponseSchema = z.object({ questions: z.array(TranslationQuestionSchema) });

// ── Helpers ────────────────────────────────────────────────────────────

async function upsertAssignment(
  userId: string,
  type: string,
  teacher: string,
  dueDate: admin.firestore.Timestamp,
  weekStartTs: admin.firestore.Timestamp,
  weekEndTs: admin.firestore.Timestamp,
  vocabListId: string,
  questionSetId: string,
  totalQuestionCount: number
): Promise<string> {
  const snap = await db
    .collection("user_todo_assignments")
    .where("userId", "==", userId)
    .where("type", "==", type)
    .where("dueDate", ">=", weekStartTs)
    .where("dueDate", "<=", weekEndTs)
    .get();

  if (!snap.empty) {
    const doc = snap.docs[0];
    await doc.ref.update({ vocabListId, questionSetId, totalQuestionCount, completedQuestionCount: 0 });
    console.log(`  Updated existing ${type} assignment: ${doc.id}`);
    return doc.id;
  }

  const ref = await db.collection("user_todo_assignments").add({
    userId,
    type,
    teacher,
    dueDate,
    totalQuestionCount,
    completedQuestionCount: 0,
    vocabListId,
    questionSetId,
    createdAt: Timestamp.now(),
  });
  console.log(`  Created new ${type} assignment: ${ref.id}`);
  return ref.id;
}

// ── Main ───────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const { start: weekStart, end: weekEnd } = getWeekBounds();
  const userId = "demo_user";
  const weekStartTs = Timestamp.fromDate(weekStart);
  const weekEndTs = Timestamp.fromDate(weekEnd);

  // 1. Find the vocab list for this user + week
  const listSnap = await db
    .collection("vocab_lists")
    .where("userId", "==", userId)
    .where("weekStart", "==", weekStartTs)
    .limit(1)
    .get();

  if (listSnap.empty) {
    console.error("No vocab_lists doc found for demo_user this week. Run seed:vocab first.");
    process.exit(1);
  }

  const vocabListId = listSnap.docs[0].id;
  const vocabList = listSnap.docs[0].data();
  const words = vocabList.words as VocabWord[];
  const learningLanguage = (vocabList.learningLanguage as string) || "es";
  console.log(`Found vocab list ${vocabListId} with ${words.length} words.`);

  const wordPairs = words.map((w) => `${w.learningLanguageWord} (${w.englishWord})`).join(", ");
  const teacher = "Teacher";
  const dueDate = Timestamp.fromDate(weekEnd);

  // 2. PRODUCTION ────────────────────────────────────────────────────────
  console.log("\n── PRODUCTION ──");
  const productionPrompt = ProductionPrompts.buildGeneratePrompt(wordPairs, words.length);
  console.log("  Calling Gemini...");
  const productionResult = await generateStructured(productionPrompt, ProductionResponseSchema);
  const productionQuestions = productionResult.questions.map((q, i) => ({
    index: i,
    sentenceInNativeLanguage: q.sentenceInNativeLanguage,
    vocabWordsUsed: q.vocabWordsUsed,
    studentAnswer: null,
    aiEvaluation: null,
  }));
  console.log(`  Gemini generated ${productionQuestions.length} production questions.`);

  const prodQsRef = await db.collection("production_question_sets").add({
    userId, vocabListId, learningLanguage, weekStart: weekStartTs, questions: productionQuestions, createdAt: Timestamp.now(),
  });
  console.log(`  Created production_question_sets: ${prodQsRef.id}`);
  await upsertAssignment(userId, "PRODUCTION", teacher, dueDate, weekStartTs, weekEndTs, vocabListId, prodQsRef.id, productionQuestions.length);

  // 3. TRANSLATION ───────────────────────────────────────────────────────
  console.log("\n── TRANSLATION ──");
  const translationPrompt = TranslationPrompts.buildGeneratePrompt(wordPairs, words.length);
  console.log("  Calling Gemini...");
  const translationResult = await generateStructured(translationPrompt, TranslationResponseSchema);
  const translationQuestions = translationResult.questions.map((q, i) => ({
    index: i,
    sentenceInLearningLanguage: q.sentenceInLearningLanguage,
    vocabWordsUsed: q.vocabWordsUsed,
    studentAnswer: null,
    aiEvaluation: null,
  }));
  console.log(`  Gemini generated ${translationQuestions.length} translation questions.`);

  const transQsRef = await db.collection("translation_question_sets").add({
    userId, vocabListId, learningLanguage, weekStart: weekStartTs, questions: translationQuestions, createdAt: Timestamp.now(),
  });
  console.log(`  Created translation_question_sets: ${transQsRef.id}`);
  await upsertAssignment(userId, "TRANSLATION", teacher, dueDate, weekStartTs, weekEndTs, vocabListId, transQsRef.id, translationQuestions.length);

  console.log("\n✓ All AI assignment types seeded from vocab list.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
