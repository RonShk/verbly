import type {DocumentSnapshot} from "firebase-admin/firestore";

/**
 * FSRS-derived category for a vocab card, mirroring the in-memory logic in
 * `getVocabSession.ts` (`getVocabDueInfo`). Shared so sentence-practice word
 * selection classifies cards the same way daily vocab does.
 */
export type CardCategory = "learning" | "new" | "dueReview" | "notDueReview" | "other";

/** A vocab_cards doc parsed and classified in memory. */
export interface ClassifiedCard {
  id: string;
  learningLanguageWord: string;
  englishWord: string;
  state: number;
  due: Date;
  stability: number;
  category: CardCategory;
  hardTag: boolean;
  leechTag: boolean;
  lastFailureAt: Date | null;
}

/**
 * End of the user's local day expressed as a UTC instant. Same convention as
 * `getVocabSession`: offset is added to UTC to get local time (e.g. PST = -480).
 */
export function endOfUserDay(utcOffsetMinutes: number): Date {
  const offsetMs = utcOffsetMinutes * 60_000;
  const localNow = new Date(Date.now() + offsetMs);
  const endLocal = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    23, 59, 59, 999,
  ));
  return new Date(endLocal.getTime() - offsetMs);
}

/** Coerces a Firestore Timestamp / Date / null into a Date (or null). */
function toDateOrNull(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  if (typeof (raw as {toDate?: unknown}).toDate === "function") {
    return (raw as {toDate: () => Date}).toDate();
  }
  return null;
}

/**
 * Classifies a vocab_cards document the same way daily vocab does:
 * - `learning`: state 1 or 3 (Learning / Relearning)
 * - `new`: state 0
 * - `dueReview`: state 2 and due on/before end of the user's day
 * - `notDueReview`: state 2 and due after end of the user's day
 * - `other`: non-numeric/unknown state (low-priority fill only)
 */
export function classifyCard(doc: DocumentSnapshot, endOfDay: Date): ClassifiedCard {
  const data = doc.data() ?? {};
  const state = typeof data.state === "number" ? data.state : -1;
  const due = toDateOrNull(data.due) ?? new Date(0);
  const stability = typeof data.stability === "number" ? data.stability : 0;

  let category: CardCategory;
  if (state === 0) {
    category = "new";
  } else if (state === 1 || state === 3) {
    category = "learning";
  } else if (state === 2) {
    category = due <= endOfDay ? "dueReview" : "notDueReview";
  } else {
    category = "other";
  }

  return {
    id: doc.id,
    learningLanguageWord: (data.learningLanguageWord as string) ?? "",
    englishWord: (data.englishWord as string) ?? "",
    state,
    due,
    stability,
    category,
    hardTag: data.hardTag === true,
    leechTag: data.leechTag === true,
    lastFailureAt: toDateOrNull(data.lastFailureAt),
  };
}
