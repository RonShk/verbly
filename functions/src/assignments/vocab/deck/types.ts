import type {Timestamp} from "firebase-admin/firestore";

export type StateBucket = "new" | "learning" | "review" | "relearning";

export interface StateCounts {
  new: number;
  learning: number;
  review: number;
  relearning: number;
}

/** Fields on student_vocab/{studentUid} (deck metadata + summary). */
export interface VocabDeckDoc {
  studentUid: string;
  tutorId: string | null;
  learningLanguage: string;
  knownLanguage: string;
  totalCards: number;
  stateCounts: StateCounts;
  lastReviewAt: Timestamp | null;
  lastActiveAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
