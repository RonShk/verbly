/**
 * Seeds a READING_VOCAB assignment by calling Gemini to generate
 * Spanish reading sentences from the demo vocab list.
 *
 * Run from project root:
 *   cd functions && npm run seed:reading-vocab
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

const ReadingVocabQuestionSchema = z.object({
  sentenceInLearningLanguage: z.string(),
  englishMeaning: z.string(),
  vocabWordsUsed: z.array(z.string()),
});

const ReadingVocabResponseSchema = z.object({
  questions: z.array(ReadingVocabQuestionSchema),
});

async function runSeedReadingVocab(): Promise<void> {
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

  // 2. Generate reading vocab questions via Gemini
  const wordPairs = SPANISH_VOCAB_WORDS.map(
    (w) => `${w.learningLanguageWord} (${w.englishWord})`
  ).join(", ");

  const prompt = `You are a Spanish language teacher creating reading practice sentences.

Given these Spanish-English vocabulary pairs: ${wordPairs}

Generate ${SPANISH_VOCAB_WORDS.length} short, simple Spanish sentences or phrases using ONLY the vocabulary words from the list above. You may also use common articles (el, la, los, las, un, una), prepositions (en, de, a, con, por, para), conjunctions (y, o, pero), and basic verbs (es, está, tiene, hay) to form grammatically correct sentences.

Each sentence should:
- Use 2-4 vocabulary words from the list
- Be beginner-friendly and easy to read
- Be a natural, meaningful sentence (not random word salad)

For each sentence, also provide its English translation.

Return a JSON object with a "questions" array. Each item must have:
- "sentenceInLearningLanguage": the Spanish sentence
- "englishMeaning": the English translation
- "vocabWordsUsed": array of the Spanish vocabulary words from the list that appear in this sentence`;

  console.log("Calling Gemini to generate reading vocab questions...");
  const result = await generateStructured(prompt, ReadingVocabResponseSchema);

  const questions = result.questions.map((q, i) => ({
    index: i,
    sentenceInLearningLanguage: q.sentenceInLearningLanguage,
    englishMeaning: q.englishMeaning,
    vocabWordsUsed: q.vocabWordsUsed,
  }));

  console.log(`Gemini generated ${questions.length} questions`);

  // 3. Store in reading_vocab_question_sets
  const questionSetRef = await db
    .collection("reading_vocab_question_sets")
    .add({
      userId,
      vocabListId,
      learningLanguage: "es",
      weekStart: weekStartTs,
      questions,
      createdAt: Timestamp.now(),
    });

  const questionSetId = questionSetRef.id;
  const totalQuestionCount = questions.length;
  console.log("Created reading_vocab_question_sets doc:", questionSetId);

  // 4. Find existing READING_VOCAB assignment for this user/week, or create one
  const weekEndTs = Timestamp.fromDate(weekEnd);
  const todoSnap = await db
    .collection("user_todo_assignments")
    .where("userId", "==", userId)
    .where("type", "==", "READING_VOCAB")
    .where("dueDate", ">=", weekStartTs)
    .where("dueDate", "<=", weekEndTs)
    .get();

  const readingVocabDueDate = Timestamp.fromDate(
    new Date(weekEnd.getTime() - 1 * 24 * 60 * 60 * 1000)
  );

  if (!todoSnap.empty) {
    const doc = todoSnap.docs[0];
    await doc.ref.update({
      vocabListId,
      questionSetId,
      totalQuestionCount,
      completedQuestionCount: 0,
    });
    console.log("Updated existing READING_VOCAB assignment:", doc.id);
  } else {
    const newRef = await db.collection("user_todo_assignments").add({
      userId,
      type: "READING_VOCAB",
      teacher: "Prof. Elena Vance",
      dueDate: readingVocabDueDate,
      totalQuestionCount,
      completedQuestionCount: 0,
      vocabListId,
      questionSetId,
      createdAt: Timestamp.now(),
    });
    console.log("Created new READING_VOCAB assignment:", newRef.id);
  }

  console.log(
    "Seed reading vocab complete. reading_vocab_question_sets: 1, assignment linked."
  );
}

runSeedReadingVocab().catch((e) => {
  console.error(e);
  process.exit(1);
});
