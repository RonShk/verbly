import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {z} from "zod";
import {generateStructured} from "../../ai/geminiClient";
import {selectTargetWordsForSession} from "../../utils/selectTargetWordsForSession";
import {TranslationPrompts} from "./prompts";

const db = admin.firestore();

const generationSchemaDescriptions = TranslationPrompts.descriptions.generate;

const TranslationQuestionSchema = z.object({
  sentenceInLearningLanguage: z.string().describe(generationSchemaDescriptions.sentenceInLearningLanguage),
  vocabWordsUsed: z.array(z.string()).describe(generationSchemaDescriptions.vocabWordsUsed),
});

const TranslationResponseSchema = z.object({
  questions: z.array(TranslationQuestionSchema),
});

/**
 * Generates a new set of translation questions for the user and creates
 * the corresponding assignment and question set documents in Firestore.
 */
export async function generateTranslationQuestions(userId: string, assignmentDate: string): Promise<{ assignmentId: string; questionSetId: string; totalQuestionCount: number }> {
  const words = await selectTargetWordsForSession(userId, {maxWords: 30});

  if (words.length === 0) {
    throw new Error("No vocab words available. Add words before starting a translation session.");
  }

  const wordPairs = words.map((w) => `${w.learningLanguageWord} (${w.englishWord})`).join(", ");
  const prompt = TranslationPrompts.buildGeneratePrompt(wordPairs, 10);

  const result = await generateStructured(prompt, TranslationResponseSchema);

  const questions = result.questions.map((q, i) => ({
    index: i,
    sentenceInLearningLanguage: q.sentenceInLearningLanguage,
    vocabWordsUsed: q.vocabWordsUsed,
    studentAnswer: null,
    aiEvaluation: null,
  }));

  const now = Timestamp.now();

  const questionSetRef = await db.collection("translation_question_sets").add({
    userId,
    learningLanguage: "es",
    questions,
    createdAt: now,
  });

  const questionSetId = questionSetRef.id;
  const totalQuestionCount = questions.length;

  const assignmentRef = await db.collection("user_todo_assignments").add({
    userId,
    type: "TRANSLATION",
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
