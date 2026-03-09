import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { z } from "zod";
import { generateStructured } from "../../ai/geminiClient";
import { selectTargetWordsForSession } from "../../utils/selectTargetWordsForSession";
import { ProductionPrompts } from "./prompts";

const db = admin.firestore();

const generationSchemaDescriptions = ProductionPrompts.descriptions.generate;

const ProductionQuestionSchema = z.object({
  sentenceInNativeLanguage: z.string().describe(generationSchemaDescriptions.sentenceInNativeLanguage),
  vocabWordsUsed: z.array(z.string()).describe(generationSchemaDescriptions.vocabWordsUsed),
});

const ProductionResponseSchema = z.object({
  questions: z.array(ProductionQuestionSchema),
});

export const generateProductionQuestions = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  const vocabListId = data?.vocabListId;

  if (!userId || typeof userId !== "string" || !vocabListId || typeof vocabListId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId and vocabListId are required strings."
    );
  }

  const words = await selectTargetWordsForSession(userId, { maxWords: 30 });

  if (words.length === 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "No words available for this session."
    );
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

  const now = admin.firestore.Timestamp.now();

  const questionSetRef = await db.collection("production_question_sets").add({
    userId,
    vocabListId,
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
    vocabListId,
    questionSetId,
    createdAt: now,
  });

  return {
    assignmentId: assignmentRef.id,
    questionSetId,
    totalQuestionCount,
  };
});
