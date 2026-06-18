import * as admin from "firebase-admin";
import {deckCardsRef} from "../../../../../../assignments/vocab/deck/paths";
import {classifyCard, endOfUserDay, type ClassifiedCard} from "../../../../../../utils/vocabCardClassification";
import {getRecentlyUsedWordKeys, normalizeWord} from "./recentSentencePracticeWords";

/** Priority bucket a word was selected from (used for logging / debugging). */
export type PriorityBucket =
  | "learning"
  | "leech"
  | "hard"
  | "recentFailure"
  | "dueReview"
  | "new"
  | "notDueReview"
  | "other";

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
  /** Consider lastFailureAt within this many days as a "recent failure" (default 7). */
  recentFailureDays?: number;
  /**
   * Word keys to hard-exclude (format: "learningLanguageWord|englishWord").
   * Recently used words are also excluded automatically (see selection below).
   */
  excludeWordKeys?: string[];
  /** User's UTC offset in minutes (offset added to UTC = local). Default 0. */
  timezoneOffsetMinutes?: number;
  /**
   * How many recent assignments to scan for `vocabWordsUsed` and hard-exclude.
   * Default 16 (~last 16 sessions across modes). Set `0` to disable (tests only).
   */
  recentQuestionSetsPerCollection?: number;
  /** If true, do not load recent assignments (benchmark comparing with/without). */
  skipRecentQuestionSetExclusion?: boolean;
}

const DEFAULT_MAX_WORDS = 30;
const DEFAULT_RECENT_FAILURE_DAYS = 7;

/** Per-tier slot caps, filled in order until `maxWords` is reached. */
const TIER_QUOTAS = {
  learning: 6,
  weak: 8,
  dueReview: 12,
  new: 3,
} as const;

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

/** A classified card plus its computed selection score and weak-signal flags. */
interface ScoredCard {
  card: ClassifiedCard;
  score: number;
  recentFailure: boolean;
}

function bucketFor(c: ScoredCard): PriorityBucket {
  if (c.card.category === "learning") return "learning";
  if (c.card.leechTag) return "leech";
  if (c.card.hardTag) return "hard";
  if (c.recentFailure) return "recentFailure";
  if (c.card.category === "dueReview") return "dueReview";
  if (c.card.category === "new") return "new";
  if (c.card.category === "notDueReview") return "notDueReview";
  return "other";
}

function scoreCard(c: ClassifiedCard, recentFailure: boolean): number {
  let score = 0;
  if (c.category === "learning") score += 100;
  if (c.leechTag) score += 80;
  if (c.hardTag) score += 60;
  if (recentFailure) score += 50;
  if (c.category === "dueReview") score += 40;
  if (c.category === "new") score += 30;
  if (c.category === "notDueReview") score += 5;
  score -= Math.min(c.stability, 365) * 0.1;
  score += Math.random() * 3;
  return score;
}

/**
 * Picks up to `quota` cards from `candidates` favoring high score while keeping
 * variety: candidates are sorted by score, then `quota` are weighted-randomly
 * sampled (by score) from the top `2 × quota`. Returns the picks; mutates
 * nothing in `candidates`.
 */
function weightedSampleTopN(candidates: ScoredCard[], quota: number): ScoredCard[] {
  if (quota <= 0 || candidates.length === 0) return [];
  if (candidates.length <= quota) return [...candidates];

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const pool = sorted.slice(0, Math.min(sorted.length, quota * 2));
  const picks: ScoredCard[] = [];
  const minScore = Math.min(...pool.map((c) => c.score));
  // Shift weights so the lowest-scoring pool member still has a small chance.
  const weightOf = (c: ScoredCard) => c.score - minScore + 1;

  const remaining = [...pool];
  while (picks.length < quota && remaining.length > 0) {
    const totalWeight = remaining.reduce((s, c) => s + weightOf(c), 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      r -= weightOf(remaining[idx]);
      if (r <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    picks.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picks;
}

/**
 * Selects target words for a sentence session (translation/production) from
 * student_vocab/{userId}/cards.
 *
 * High-level contract:
 * - Loads ALL of the user's cards in a single query, then classifies them
 *   in memory the same way daily vocab does (`vocabCardClassification`).
 * - Hard-excludes words used in the user's recent translation/production
 *   sessions (cross-session variety), plus any explicit `excludeWordKeys`.
 * - Fills up to `maxWords` slots via tier quotas (learning → weak → due review →
 *   new → variety), scoring + weighted-random sampling within each tier so the
 *   same well-learned words don't dominate every session.
 */
export async function selectTargetWordsForSession(userId: string, options: SelectTargetWordsOptions = {}): Promise<TargetWord[]> {
  const db = admin.firestore();
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
  const recentFailureDays = options.recentFailureDays ?? DEFAULT_RECENT_FAILURE_DAYS;
  const timezoneOffsetMinutes = options.timezoneOffsetMinutes ?? 0;
  const failureCutoff = new Date(Date.now() - recentFailureDays * 24 * 60 * 60 * 1000);
  const endOfDay = endOfUserDay(timezoneOffsetMinutes);

  // Explicit excludes (by full word key) + recently used words (by normalized
  // learning-language expression, since vocabWordsUsed stores expressions).
  const excludeKeys = new Set(options.excludeWordKeys ?? []);
  const recentSetsLimit = options.recentQuestionSetsPerCollection ?? 16;
  const recentlyUsed = options.skipRecentQuestionSetExclusion ?
    new Set<string>() :
    await getRecentlyUsedWordKeys(userId, recentSetsLimit);
/*
  console.log("[selectTargetWordsForSession] start", {
    userId,
    maxWords,
    recentFailureDays,
    timezoneOffsetMinutes,
    explicitExcludeCount: excludeKeys.size,
    recentlyUsedCount: recentlyUsed.size,
  });
  */

  const snap = await deckCardsRef(db, userId).get();
  if (snap.empty) {
    console.log("[selectTargetWordsForSession] no cards for user");
    return [];
  }

  const scored: ScoredCard[] = [];
  for (const doc of snap.docs) {
    const card = classifyCard(doc, endOfDay);
    if (!card.learningLanguageWord || !card.englishWord) continue;
    if (excludeKeys.has(wordKey(card)) || recentlyUsed.has(normalizeWord(card.learningLanguageWord))) continue;
    const recentFailure = card.lastFailureAt != null && card.lastFailureAt >= failureCutoff;
    scored.push({card, score: scoreCard(card, recentFailure), recentFailure});
  }

  // Partition into tiers. Each card lands in exactly one tier (first match in
  // priority order) so quotas don't double-count overlapping signals.
  const learningTier: ScoredCard[] = [];
  const weakTier: ScoredCard[] = [];
  const dueReviewTier: ScoredCard[] = [];
  const newTier: ScoredCard[] = [];
  const varietyTier: ScoredCard[] = [];

  for (const c of scored) {
    const isWeak = c.card.leechTag || c.card.hardTag || c.recentFailure;
    if (c.card.category === "learning") {
      learningTier.push(c);
    } else if (isWeak) {
      weakTier.push(c);
    } else if (c.card.category === "dueReview") {
      dueReviewTier.push(c);
    } else if (c.card.category === "new") {
      newTier.push(c);
    } else {
      varietyTier.push(c);
    }
  }

  const picked: ScoredCard[] = [];
  const pickedIds = new Set<string>();
  const take = (candidates: ScoredCard[], quota: number) => {
    const slotsLeft = Math.max(0, maxWords - picked.length);
    if (slotsLeft <= 0) return;
    const fresh = candidates.filter((c) => !pickedIds.has(c.card.id));
    const chosen = weightedSampleTopN(fresh, Math.min(quota, slotsLeft));
    for (const c of chosen) {
      picked.push(c);
      pickedIds.add(c.card.id);
    }
  };

  take(learningTier, TIER_QUOTAS.learning);
  take(weakTier, TIER_QUOTAS.weak);
  take(dueReviewTier, TIER_QUOTAS.dueReview);
  take(newTier, TIER_QUOTAS.new);

  // Variety tier (+ any leftover from earlier tiers) fills the remainder.
  const remainder = Math.max(0, maxWords - picked.length);
  if (remainder > 0) {
    const leftovers = [...varietyTier, ...learningTier, ...weakTier, ...dueReviewTier, ...newTier]
      .filter((c) => !pickedIds.has(c.card.id));
    // Dedupe (a card could appear once across these arrays, but be safe).
    const seen = new Set<string>();
    const uniqueLeftovers = leftovers.filter((c) => {
      if (seen.has(c.card.id)) return false;
      seen.add(c.card.id);
      return true;
    });
    take(uniqueLeftovers, remainder);
  }

  const result = shuffle(picked).map((c) => ({
    learningLanguageWord: c.card.learningLanguageWord,
    englishWord: c.card.englishWord,
    priorityBucket: bucketFor(c),
  }));

  const byBucket: Record<string, number> = {};
  for (const w of result) byBucket[w.priorityBucket] = (byBucket[w.priorityBucket] ?? 0) + 1;
  /*
  console.log("[selectTargetWordsForSession] result", {
    eligible: scored.length,
    excludedCount,
    tiers: {
      learning: learningTier.length,
      weak: weakTier.length,
      dueReview: dueReviewTier.length,
      new: newTier.length,
      variety: varietyTier.length,
    },
    returnedCount: result.length,
    byBucket,
  });
  */
  return result;
}
