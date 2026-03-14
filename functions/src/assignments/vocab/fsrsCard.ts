import type {Card} from "ts-fsrs";
import {createEmptyCard, fsrs, Rating, State} from "ts-fsrs";
import type {Timestamp} from "firebase-admin/firestore";

/** Firestore vocab_cards document fields (FSRS + app fields). */
export interface VocabCardDoc {
  userId: string;
  vocabListId: string;
  learningLanguageWord: string;
  englishWord: string;
  due: Timestamp;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Timestamp | null;
  createdAt: Timestamp;
}

const f = fsrs();

/**
 * Builds an empty FSRS card and returns Firestore-ready fields for a new vocab_cards doc.
 */
export function emptyVocabCardFields(now: Date, TimestampClass: { fromDate(d: Date): Timestamp }): Omit<VocabCardDoc, "userId" | "vocabListId" | "learningLanguageWord" | "englishWord" | "createdAt"> {
  const card = createEmptyCard(now);
  return {
    due: TimestampClass.fromDate(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    lastReview: card.last_review ? TimestampClass.fromDate(card.last_review) : null,
  };
}

/**
 * Converts a Firestore vocab_cards doc (with Timestamp) to a ts-fsrs Card (with Date).
 */
export function docToCard(doc: VocabCardDoc): Card {
  return {
    due: doc.due.toDate(),
    stability: doc.stability,
    difficulty: doc.difficulty,
    elapsed_days: doc.elapsedDays,
    scheduled_days: doc.scheduledDays,
    learning_steps: doc.learningSteps,
    reps: doc.reps,
    lapses: doc.lapses,
    state: doc.state as State,
    last_review: doc.lastReview ? doc.lastReview.toDate() : undefined,
  };
}

/**
 * Converts a ts-fsrs Card and optional last_review to Firestore-update shape.
 * Uses Timestamp.fromDate for due and last_review.
 */
export function cardToUpdate(card: Card, TimestampClass: { fromDate(d: Date): Timestamp }): Omit<VocabCardDoc, "userId" | "vocabListId" | "learningLanguageWord" | "englishWord" | "createdAt"> {
  return {
    due: TimestampClass.fromDate(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    lastReview: card.last_review ? TimestampClass.fromDate(card.last_review) : null,
  };
}

/** Rating values from client: 1=Again, 2=Hard, 3=Good, 4=Easy (ts-fsrs Rating enum). */
export function toRating(rating: number): Rating {
  if (rating >= 1 && rating <= 4) return rating as Rating;
  throw new Error("Invalid rating; expected 1-4 (Again/Hard/Good/Easy).");
}

/**
 * Returns the FSRS scheduler instance (default params).
 * Use f.repeat(card, now) for all options or f.next(card, now, grade) for one rating.
 */
export function getFSRS() {
  return f;
}
