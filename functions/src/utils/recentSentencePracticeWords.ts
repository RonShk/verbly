import * as admin from "firebase-admin";

/** Question set collections whose recently-used words we exclude from new sessions. */
const QUESTION_SET_COLLECTIONS = ["translation_question_sets", "production_question_sets"] as const;

/** How many recent question sets per collection to scan for used words. */
const DEFAULT_RECENT_SETS_PER_COLLECTION = 8;

/**
 * Normalizes a learning-language word/expression for set membership comparison.
 * `vocabWordsUsed` stores the Spanish expression as the model wrote it, which
 * may differ from a card's `learningLanguageWord` in case/spacing/punctuation,
 * so both sides are normalized the same way before matching.
 */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFC")
    .replace(/[¿?¡!.,;:"'()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loads the set of recently used vocab words (normalized) across the user's
 * most recent translation and production question sets. Used to exclude words
 * that were just practiced so consecutive sessions feel fresh.
 *
 * Failures (e.g. a missing composite index) are swallowed and treated as "no
 * recent words" so word selection never hard-fails on this best-effort signal.
 */
/**
 * @param perCollectionLimit Recent question sets per mode (translation + production).
 *   Each set is one completed/enqueued session (~10 questions). Use `2` to skip words
 *   from the last two translation and last two production sessions. Pass `0` to skip
 *   the Firestore reads entirely (benchmark / tests only).
 */
export async function getRecentlyUsedWordKeys(userId: string, perCollectionLimit = DEFAULT_RECENT_SETS_PER_COLLECTION): Promise<Set<string>> {
  if (perCollectionLimit <= 0) return new Set();
  const db = admin.firestore();
  const used = new Set<string>();

  await Promise.all(QUESTION_SET_COLLECTIONS.map(async (collection) => {
    try {
      const snap = await db
        .collection(collection)
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(perCollectionLimit)
        .get();

      for (const doc of snap.docs) {
        const questions = doc.data().questions;
        if (!Array.isArray(questions)) continue;
        for (const q of questions) {
          const words = (q as {vocabWordsUsed?: unknown}).vocabWordsUsed;
          if (!Array.isArray(words)) continue;
          for (const w of words) {
            if (typeof w === "string" && w.trim().length > 0) used.add(normalizeWord(w));
          }
        }
      }
    } catch (err) {
      console.warn(`[getRecentlyUsedWordKeys] skipping ${collection}: ${String(err)}`);
    }
  }));

  return used;
}
