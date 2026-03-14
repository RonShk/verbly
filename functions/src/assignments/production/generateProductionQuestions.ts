import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {z} from "zod";
import {generateStructured} from "../../ai/geminiClient";
import {selectTargetWordsForSession} from "../../utils/selectTargetWordsForSession";
import {ProductionPrompts} from "./prompts";

const db = admin.firestore();

const generationSchemaDescriptions = ProductionPrompts.descriptions.generate;

const ProductionQuestionSchema = z.object({
  sentenceInNativeLanguage: z.string().describe(generationSchemaDescriptions.sentenceInNativeLanguage),
  vocabWordsUsed: z.array(z.string()).describe(generationSchemaDescriptions.vocabWordsUsed),
});

const ProductionResponseSchema = z.object({
  questions: z.array(ProductionQuestionSchema),
});

/**
 * Generates a new set of production questions for the user and creates
 * the corresponding assignment and question set documents in Firestore.
 */
export async function generateProductionQuestions(userId: string, assignmentDate: string): Promise<{ assignmentId: string; questionSetId: string; totalQuestionCount: number }> {
  const words = await selectTargetWordsForSession(userId, {maxWords: 30});

  if (words.length === 0) {
    throw new Error("No vocab words available. Add words before starting a production session.");
  }

  const wordPairs = words.map((w) => `${w.learningLanguageWord} (${w.englishWord})`).join(", ");
  const prompt = ProductionPrompts.buildGeneratePrompt(wordPairs, 10);

  const result = await generateStructured(prompt, ProductionResponseSchema);

  const questions = result.questions.map((q, i) => ({
    index: i,
    sentenceInNativeLanguage: q.sentenceInNativeLanguage,
    vocabWordsUsed: q.vocabWordsUsed,
    studentAnswer: null,
    aiEvaluation: null,
  }));

  const now = Timestamp.now();

  const questionSetRef = await db.collection("production_question_sets").add({
    userId,
    learningLanguage: "es",
    questions,
    createdAt: now,
  });

  const questionSetId = questionSetRef.id;
  const totalQuestionCount = questions.length;

  const assignmentRef = await db.collection("user_todo_assignments").add({
    userId,
    type: "PRODUCTION",
    teacher: "AI Generated",
    totalQuestionCount,
    completedQuestionCount: 0,
    questionSetId,
    assignmentDate,
    createdAt: now,
  });

  return {
    assignmentId: assignmentRef.id,
    questionSetId,
    totalQuestionCount,
  };
}
