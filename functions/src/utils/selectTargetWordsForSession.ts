import * as admin from "firebase-admin";

/** Priority bucket a word was selected from. */
export type PriorityBucket = "new" | "recentFailure" | "hard" | "leech";

/** A word chosen for a session, with the bucket it came from. */
export interface TargetWord {
  learningLanguageWord: string;
  englishWord: string;
  priorityBucket: PriorityBucket;
}

export interface SelectTargetWordsOptions {
  /**
   * Max number of words to return.
   * For sentence practice, we typically want 20–30 (default 30).
   */
  maxWords?: number;
  /** Consider lastFailureAt within this many days (default 7). */
  recentFailureDays?: number;
  /**
   * Target number of "new" words (cards with state === 0, i.e. FSRS New).
   * Default 15.
   */
  newTarget?: number;
  /**
   * Word keys to exclude (e.g. already used this session).
   * Format: "learningLanguageWord|englishWord".
   */
  excludeWordKeys?: string[];
}

const DEFAULT_OPTIONS: Required<Omit<SelectTargetWordsOptions, "excludeWordKeys">> = {
  maxWords: 30,
  recentFailureDays: 7,
  newTarget: 15,
};

function shuffle<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Builds a unique key for a word pair (e.g. for excludeWordKeys). */
export function wordKey(w: { learningLanguageWord: string; englishWord: string }): string {
  return `${w.learningLanguageWord}|${w.englishWord}`;
}

/**
 * Splits the desired number of challenge slots across recentFailure, hard, and leech.
 * Returns the limit to use for each Firestore query so we fetch a balanced mix.
 */
export function getChallengeMix(totalSlots: number): {recentFailureLimit: number; hardLimit: number; leechLimit: number;} {
  if (totalSlots <= 0) {
    return { recentFailureLimit: 0, hardLimit: 0, leechLimit: 0 };
  }

  const a = Math.ceil(totalSlots / 3);
  const b = Math.ceil((totalSlots - a) / 2);
  const c = totalSlots - a - b;
  return {
    recentFailureLimit: a,
    hardLimit: b,
    leechLimit: c,
  };
}

/**
 * Selects target words for a sentence session (translation/production) from vocab_cards.
 *
 * High-level contract:
 * - Aim for up to `maxWords` total (default 30).
 * - Aim for up to `newTarget` "new" words (default 15), where "new" =
 *   cards with state === 0 (FSRS New).
 * - Fill the remaining slots with a mix of leech, hard, and recentFailure words.
 * - Use excludeWordKeys to avoid reusing words already used in the current session.
 */
export async function selectTargetWordsForSession(userId: string, options: SelectTargetWordsOptions = {}): Promise<TargetWord[]> {
  const db = admin.firestore();
  const Timestamp = admin.firestore.Timestamp;
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const excludeSet = options.excludeWordKeys ? new Set(options.excludeWordKeys) : null;
  const now = new Date();
  const failureCutoff = new Date(now);
  failureCutoff.setDate(failureCutoff.getDate() - opts.recentFailureDays);
  const failureCutoffTs = Timestamp.fromDate(failureCutoff);

  type Doc = admin.firestore.DocumentSnapshot;
  const toTarget = (d: Doc, bucket: PriorityBucket): TargetWord => {
    const data = d.data()!;
    return {
      learningLanguageWord: data.learningLanguageWord as string,
      englishWord: data.englishWord as string,
      priorityBucket: bucket,
    };
  };

  const newTarget = opts.newTarget;

  // 1) New words = cards with state === 0 (FSRS New)
  const newSnap = await db
    .collection("vocab_cards")
    .where("userId", "==", userId)
    .where("state", "==", 0)
    .orderBy("createdAt", "desc")
    .limit(newTarget)
    .get();

  // 2–4) Challenge words: mix of recentFailure, hard, leech (limits from getChallengeMix)
  const challengeTarget = Math.max(0, opts.maxWords - opts.newTarget);
  const { recentFailureLimit, hardLimit, leechLimit } = getChallengeMix(challengeTarget);

  const recentFailureSnap = await db
    .collection("vocab_cards")
    .where("userId", "==", userId)
    .where("lastFailureAt", ">=", failureCutoffTs)
    .orderBy("lastFailureAt", "desc")
    .limit(recentFailureLimit)
    .get();

  const hardSnap = await db
    .collection("vocab_cards")
    .where("userId", "==", userId)
    .where("hardTag", "==", true)
    .limit(hardLimit)
    .get();

  const leechSnap = await db
    .collection("vocab_cards")
    .where("userId", "==", userId)
    .where("leechTag", "==", true)
    .limit(leechLimit)
    .get();

  const byKey = new Map<string, TargetWord>();

  // Priority when a word appears in multiple buckets: leech > hard > recentFailure > new
  const assign = (w: TargetWord) => {
    const key = wordKey(w);
    const existing = byKey.get(key);
    const order: PriorityBucket[] = ["leech", "hard", "recentFailure", "new"];
    if (!existing || order.indexOf(w.priorityBucket) < order.indexOf(existing.priorityBucket)) {
      byKey.set(key, w);
    }
  };

  newSnap.docs.forEach((d) => assign(toTarget(d, "new")));
  recentFailureSnap.docs.forEach((d) => assign(toTarget(d, "recentFailure")));
  hardSnap.docs.forEach((d) => assign(toTarget(d, "hard")));
  leechSnap.docs.forEach((d) => assign(toTarget(d, "leech")));

  let all = Array.from(byKey.values());
  if (excludeSet && excludeSet.size > 0) {
    all = all.filter((w) => !excludeSet.has(wordKey(w)));
  }

  const fromNew = all.filter((w) => w.priorityBucket === "new");
  const fromFailuresAndHard: TargetWord[] = all.filter(
    (w) => w.priorityBucket === "recentFailure" || w.priorityBucket === "hard" || w.priorityBucket === "leech"
  );

  // 6) Pick up to newTarget from "new".
  const picked: TargetWord[] = [];
  picked.push(...shuffle(fromNew).slice(0, newTarget));

  // 7) Fill the remaining slots with a mix of leech, hard, and recentFailure.
  const remainingSlots = Math.max(0, opts.maxWords - picked.length);
  if (remainingSlots > 0 && fromFailuresAndHard.length > 0) {
    picked.push(...shuffle(fromFailuresAndHard).slice(0, remainingSlots));
  }

  const shuffled = shuffle(picked);
  return shuffled.slice(0, Math.min(opts.maxWords, picked.length));
}


/*

  type Card = {
    due: Date;             // Date when the card is next due for review
    stability: number;     // A measure of how well the information is retained
    difficulty: number;    // Reflects the inherent difficulty of the card content
    elapsed_days: number;  // Days since the card was last reviewed
    scheduled_days: number;// The interval of time in days between this review and the next one
    learning_steps: number;// Keeps track of the current step during the (re)learning stages
    reps: number;          // Total number of times the card has been reviewed
    lapses: number;        // Times the card was forgotten or remembered incorrectly
    state: State;          // The current state of the card (New, Learning, Review, Relearning)
    last_review?: Date;    // The most recent review date, if applicable
  };

*/