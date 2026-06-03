import * as admin from "firebase-admin";
import {ASSIGNMENTS_COLLECTION} from "../../../core/assignmentRefs";

/** How many recent assignments to scan for already-used words. */
const DEFAULT_RECENT_ASSIGNMENTS = 16;

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
 * Loads the set of recently used vocab words (normalized) from the user's most
 * recent assignments. Reads the denormalized `vocabWordKeysUsed` summary on each
 * assignment doc (written by the generation worker) so we never have to scan the
 * `questions` subcollections. Used to exclude words that were just practiced so
 * consecutive sessions feel fresh.
 *
 * Failures (e.g. a missing composite index) are swallowed and treated as "no
 * recent words" so word selection never hard-fails on this best-effort signal.
 */
export async function getRecentlyUsedWordKeys(userId: string, recentAssignmentsLimit = DEFAULT_RECENT_ASSIGNMENTS): Promise<Set<string>> {
  if (recentAssignmentsLimit <= 0) return new Set();
  const used = new Set<string>();

  try {
    const snap = await admin.firestore()
      .collection(ASSIGNMENTS_COLLECTION)
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(recentAssignmentsLimit)
      .get();

    for (const doc of snap.docs) {
      const words = doc.data().vocabWordKeysUsed;
      if (!Array.isArray(words)) continue;
      for (const w of words) {
        if (typeof w === "string" && w.trim().length > 0) used.add(normalizeWord(w));
      }
    }
  } catch (err) {
    console.warn(`[getRecentlyUsedWordKeys] skipping recent-words exclusion: ${String(err)}`);
  }

  return used;
}
