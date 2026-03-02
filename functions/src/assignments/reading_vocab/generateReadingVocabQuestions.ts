import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { z } from "zod";
import { generateStructured } from "../../ai/geminiClient";

const db = admin.firestore();

const ReadingVocabQuestionSchema = z.object({
  sentenceInLearningLanguage: z.string(),
  englishMeaning: z.string(),
  vocabWordsUsed: z.array(z.string()),
});

const ReadingVocabResponseSchema = z.object({
  questions: z.array(ReadingVocabQuestionSchema),
});

export const generateReadingVocabQuestions = functions.https.onCall(
  async (data) => {
    const userId = data?.userId;
    const vocabListId = data?.vocabListId;

    if (!userId ||typeof userId !== "string" || !vocabListId || typeof vocabListId !== "string") {
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
    const words = vocabList.words as Array<{learningLanguageWord: string; englishWord: string;}>;

    if (!words || words.length === 0) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Vocab list has no words."
      );
    }

    const wordPairs = words
      .map((w) => `${w.learningLanguageWord} (${w.englishWord})`)
      .join(", ");

    const prompt = `You are a Spanish language teacher creating reading practice sentences.

      Given these Spanish-English vocabulary pairs: ${wordPairs}

      Generate ${words.length} short, simple Spanish sentences or phrases using ONLY the vocabulary words from the list above. 
      You may also use common articles (el, la, los, las, un, una), prepositions (en, de, a, con, por, para), conjunctions (y, o, pero), and basic verbs (es, está, tiene, hay) to form grammatically correct sentences.

      Each sentence should:
      - Use 2-4 vocabulary words from the list
      - Be beginner-friendly and easy to read
      - Be a natural, meaningful sentence (not random word salad)

      For each sentence, also provide its English translation.

      Return a JSON object with a "questions" array. Each item must have:
      - "sentenceInLearningLanguage": the Spanish sentence
      - "englishMeaning": the English translation
      - "vocabWordsUsed": array of the Spanish vocabulary words from the list that appear in this sentence`;

    const result = await generateStructured(prompt, ReadingVocabResponseSchema);

    const questions = result.questions.map((q, i) => ({
      index: i,
      sentenceInLearningLanguage: q.sentenceInLearningLanguage,
      englishMeaning: q.englishMeaning,
      vocabWordsUsed: q.vocabWordsUsed,
    }));

    const learningLanguage = (vocabList.learningLanguage as string) || "es";
    const weekStart = vocabList.weekStart ?? admin.firestore.Timestamp.now();

    const questionSetRef = await db
      .collection("reading_vocab_question_sets")
      .add({
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
      type: "READING_VOCAB",
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
  }
);
