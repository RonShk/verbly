import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { z } from "zod";
import { generateStructured } from "../../ai/geminiClient";
import { TranslationPrompts } from "./prompts";

const db = admin.firestore();

const generationSchemaDescriptions = TranslationPrompts.descriptions.generate;

const TranslationQuestionSchema = z.object({
  sentenceInLearningLanguage: z.string().describe(generationSchemaDescriptions.sentenceInLearningLanguage),
  vocabWordsUsed: z.array(z.string()).describe(generationSchemaDescriptions.vocabWordsUsed),
});

const TranslationResponseSchema = z.object({
  questions: z.array(TranslationQuestionSchema),
});

export const generateTranslationQuestions = functions.https.onCall(async (data) => {
  const userId = data?.userId;
  const vocabListId = data?.vocabListId;

  if (!userId || typeof userId !== "string" || !vocabListId || typeof vocabListId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId and vocabListId are required strings."
    );
  }

  const vocabListSnap = await db.collection("vocab_lists").doc(vocabListId).get();

  if (!vocabListSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Vocab list not found.");
  }

  const vocabList = vocabListSnap.data()!;
  const words = vocabList.words as Array<{
    learningLanguageWord: string;
    englishWord: string;
  }>;

  if (!words || words.length === 0) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Vocab list has no words."
    );
  }

  const wordPairs = words.map((w) => `${w.learningLanguageWord} (${w.englishWord})`).join(", ");

  const prompt = TranslationPrompts.buildGeneratePrompt(wordPairs, words.length);

  const result = await generateStructured(prompt, TranslationResponseSchema);

  const questions = result.questions.map((q, i) => ({
    index: i,
    sentenceInLearningLanguage: q.sentenceInLearningLanguage,
    vocabWordsUsed: q.vocabWordsUsed,
    studentAnswer: null,
    aiEvaluation: null,
  }));

  const learningLanguage = (vocabList.learningLanguage as string) || "es";
  const weekStart = vocabList.weekStart ?? admin.firestore.Timestamp.now();

  const questionSetRef = await db.collection("translation_question_sets").add({
    userId,
    vocabListId,
    learningLanguage,
    weekStart,
    questions,
    createdAt: admin.firestore.Timestamp.now(),
  });

  const questionSetId = questionSetRef.id;
  const totalQuestionCount = questions.length;

  const weekStartDate = weekStart.toDate();
  const dueDate = new Date(weekStartDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + 6);

  const assignmentRef = await db.collection("user_todo_assignments").add({
    userId,
    type: "TRANSLATION",
    teacher: "AI Generated",
    dueDate: admin.firestore.Timestamp.fromDate(dueDate),
    totalQuestionCount,
    completedQuestionCount: 0,
    vocabListId,
    questionSetId,
    createdAt: admin.firestore.Timestamp.now(),
  });

  return {
    assignmentId: assignmentRef.id,
    questionSetId,
    totalQuestionCount,
  };
});
