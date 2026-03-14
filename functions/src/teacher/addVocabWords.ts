import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {emptyVocabCardFields} from "../assignments/vocab/fsrsCard";

const db = admin.firestore();

type VocabWord = { learningLanguageWord: string; englishWord: string };

/**
 * Appends new words to the student's vocab list (e.g. when teacher uploads a CSV).
 * If no vocab list exists for that userId yet, creates one.
 * Deduplicates by (learningLanguageWord, englishWord) so the same pair is never added twice.
 * Creates an FSRS vocab_cards doc for each new word.
 */
export const addVocabWords = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const userId = data?.userId;
  const words = data?.words as VocabWord[] | undefined;
  const learningLanguage = (data?.learningLanguage as string) || "es";

  if (!userId || typeof userId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "userId is required and must be a string."
    );
  }

  if (!Array.isArray(words) || words.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "words is required and must be a non-empty array of { learningLanguageWord, englishWord }."
    );
  }

  const validWords: VocabWord[] = [];
  for (const w of words) {
    const lang = w?.learningLanguageWord?.trim();
    const eng = w?.englishWord?.trim();
    if (lang && eng) {
      validWords.push({learningLanguageWord: lang, englishWord: eng});
    }
  }

  if (validWords.length === 0) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "At least one valid word pair (learningLanguageWord, englishWord) is required."
    );
  }

  // Find existing vocab list for this student
  const existingSnap = await db.collection("vocab_lists").where("userId", "==", userId).limit(1).get();

  if (existingSnap.empty) {
    // First upload: create the vocab list
    const ref = await db.collection("vocab_lists").add({
      userId,
      learningLanguage,
      words: validWords,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    const now = new Date();
    const nowTs = Timestamp.now();
    const baseCardFields = emptyVocabCardFields(now, Timestamp);
    for (const w of validWords) {
      await db.collection("vocab_cards").add({
        ...baseCardFields,
        userId,
        vocabListId: ref.id,
        learningLanguageWord: w.learningLanguageWord,
        englishWord: w.englishWord,
        createdAt: nowTs,
        firstLearnedAt: null,
        lastFailureAt: null,
        againCount: 0,
        hardTag: false,
        leechTag: false,
      });
    }

    return {
      vocabListId: ref.id,
      newWordsAdded: validWords.length,
      totalWords: validWords.length,
    };
  }

  // Append to existing list, deduplicating
  const doc = existingSnap.docs[0];
  const existing = doc.data();
  const existingWords = (existing.words as VocabWord[]) || [];

  const seen = new Set(
    existingWords.map((w) => `${w.learningLanguageWord.trim().toLowerCase()}|${w.englishWord.trim().toLowerCase()}`)
  );

  const newWords: VocabWord[] = [];
  for (const w of validWords) {
    const key = `${w.learningLanguageWord.toLowerCase()}|${w.englishWord.toLowerCase()}`;
    if (!seen.has(key)) {
      newWords.push(w);
      seen.add(key);
    }
  }

  if (newWords.length > 0) {
    await doc.ref.update({
      words: [...existingWords, ...newWords],
      updatedAt: Timestamp.now(),
    });

    const now = new Date();
    const nowTs = Timestamp.now();
    const baseCardFields = emptyVocabCardFields(now, Timestamp);
    for (const w of newWords) {
      await db.collection("vocab_cards").add({
        ...baseCardFields,
        userId,
        vocabListId: doc.id,
        learningLanguageWord: w.learningLanguageWord,
        englishWord: w.englishWord,
        createdAt: nowTs,
        firstLearnedAt: null,
        lastFailureAt: null,
        againCount: 0,
        hardTag: false,
        leechTag: false,
      });
    }
  }

  return {
    vocabListId: doc.id,
    newWordsAdded: newWords.length,
    totalWords: existingWords.length + newWords.length,
  };
});
