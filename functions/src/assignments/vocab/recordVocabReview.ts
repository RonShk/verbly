import * as admin from "firebase-admin";
import {FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot} from "firebase-admin/firestore";
import type {Grade} from "ts-fsrs";
import {
  docToCard,
  cardToUpdate,
  toRating,
  getFSRS,
  type VocabCardDoc,
} from "./fsrsCard";
import {deckCardRef, deckRef} from "./deck/paths";
import {stateCountDelta} from "./deck/summary";
import {assignmentsCollection, vocabQuestionRef, VOCAB_TYPE} from "./dailyVocabAssignment";

/** Thrown when the rated card does not exist in the user's deck. */
export class VocabCardNotFoundError extends Error {
  constructor() {
    super("Vocab card not found.");
    this.name = "VocabCardNotFoundError";
  }
}

export interface RecordVocabReviewInput {
  vocabCardId: string;
  /** FSRS rating: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. */
  rating: number;
  /** Wave the card was shown in. Empty when the client has no persisted wave. */
  assignmentId: string;
  /** Id of the question doc within the wave. Null when unknown. */
  questionIndex: number | null;
  timezoneOffsetMinutes: number;
}

export interface RecordVocabReviewResult {
  assignmentId: string;
  completedQuestionCount: number;
  totalQuestionCount: number;
  cumulativeOffsetQuestionCount: number;
  assignmentCompleted: boolean;
  /** If false, the card's new due date is past today; drop it from the wave. */
  stillDueToday: boolean;
}

/**
 * Returns true if the given UTC date falls on the same calendar day as "now" in the user's timezone,
 * or on an earlier day. Returns false if the due date is tomorrow or later in the user's timezone.
 * Uses same offset convention as getWeekBounds: offset is added to UTC to get local (e.g. PST = -480).
 */
function isStillDueToday(dueUtc: Date, nowUtc: Date, timezoneOffsetMinutes: number): boolean {
  const offsetMs = timezoneOffsetMinutes * 60 * 1000;
  const userNow = new Date(nowUtc.getTime() + offsetMs);
  const dueInUserTz = new Date(dueUtc.getTime() + offsetMs);
  const todayDay = userNow.getUTCFullYear() * 10000 + userNow.getUTCMonth() * 100 + userNow.getUTCDate();
  const dueDay = dueInUserTz.getUTCFullYear() * 10000 + dueInUserTz.getUTCMonth() * 100 + dueInUserTz.getUTCDate();
  return dueDay <= todayDay;
}

/**
 * Records an FSRS rating for one card and advances the persisted vocab wave in
 * the same transaction, so progress survives a refresh.
 *
 * A card that is still due today stays PENDING and is pushed to the back of the
 * wave's queue (`queueOrder` = the assignment's `nextQueueOrder`); otherwise it
 * is marked DONE and `completedQuestionCount` advances, completing the
 * assignment when it reaches the total.
 *
 * The card and deck summary always advance, even when the wave cannot be
 * resolved (stale or missing assignment id): the review itself is the source of
 * truth for FSRS scheduling.
 */
export async function recordVocabReview(userId: string, input: RecordVocabReviewInput): Promise<RecordVocabReviewResult> {
  const db = admin.firestore();
  const {vocabCardId, rating, assignmentId, questionIndex, timezoneOffsetMinutes} = input;

  const cardRef = deckCardRef(db, userId, vocabCardId);
  const deckDocRef = deckRef(db, userId);
  const assignmentRef: DocumentReference | null = assignmentId ? assignmentsCollection().doc(assignmentId) : null;
  const questionRef: DocumentReference | null = assignmentRef && questionIndex !== null ? vocabQuestionRef(assignmentRef, questionIndex) : null;

  const now = new Date();
  const reviewTs = Timestamp.fromDate(now);

  return db.runTransaction(async (tx) => {
    const refs: DocumentReference[] = [cardRef];
    if (assignmentRef) refs.push(assignmentRef);
    if (questionRef) refs.push(questionRef);

    const snaps = await tx.getAll(...refs);
    const cardSnap = snaps[0];
    const assignmentSnap: DocumentSnapshot | null = assignmentRef ? snaps[1] : null;
    const questionSnap: DocumentSnapshot | null = questionRef ? snaps[2] : null;

    if (!cardSnap.exists) throw new VocabCardNotFoundError();

    const cardData = cardSnap.data() as VocabCardDoc;
    const oldState = typeof cardData.state === "number" ? cardData.state : 0;
    const {card: nextCard} = getFSRS().next(docToCard(cardData), now, toRating(rating) as Grade);
    const update = cardToUpdate(nextCard, Timestamp);

    const raw = cardData as unknown as Record<string, unknown>;
    const prevAgainCount = (raw.againCount as number | undefined) ?? 0;
    const statsUpdate: Record<string, unknown> = {};

    if (raw.firstLearnedAt == null) {
      statsUpdate.firstLearnedAt = reviewTs;
    }

    if (rating <= 2) {
      const newAgainCount = prevAgainCount + 1;
      statsUpdate.lastFailureAt = reviewTs;
      statsUpdate.againCount = newAgainCount;
      if (newAgainCount >= 2) statsUpdate.hardTag = true;
      if (newAgainCount >= 5) statsUpdate.leechTag = true;
    }

    const stillDueToday = isStillDueToday(nextCard.due, now, timezoneOffsetMinutes);

    tx.update(cardRef, {...update, ...statsUpdate});
    tx.set(deckDocRef, {
      studentUid: userId,
      lastReviewAt: reviewTs,
      updatedAt: FieldValue.serverTimestamp(),
      ...stateCountDelta(oldState, nextCard.state as number),
    }, {merge: true});

    const assignmentData = assignmentSnap?.exists ? assignmentSnap.data() ?? {} : null;
    const ownsAssignment = assignmentData !== null && assignmentData.userId === userId && assignmentData.type === VOCAB_TYPE;
    const total = (assignmentData?.totalQuestionCount as number | undefined) ?? 0;
    const storedCompleted = (assignmentData?.completedQuestionCount as number | undefined) ?? 0;
    const cumulativeOffset = (assignmentData?.cumulativeOffsetQuestionCount as number | undefined) ?? 0;

    const unchanged: RecordVocabReviewResult = {
      assignmentId,
      completedQuestionCount: storedCompleted,
      totalQuestionCount: total,
      cumulativeOffsetQuestionCount: cumulativeOffset,
      assignmentCompleted: total > 0 && storedCompleted >= total,
      stillDueToday,
    };

    // No persisted wave to advance (stale id, or a client that didn't send one).
    if (!ownsAssignment || !questionSnap?.exists) return {...unchanged, assignmentCompleted: false};
    // Already answered (e.g. a double tap): don't double-count.
    if ((questionSnap.data()?.status as string | undefined) === "DONE") return unchanged;

    if (stillDueToday) {
      // Re-queue at the back of this wave; the completed count is unchanged,
      // but the wave counts as started so it leaves the COMPLETED section.
      const nextQueueOrder = (assignmentData?.nextQueueOrder as number | undefined) ?? total;
      tx.update(questionRef!, {queueOrder: nextQueueOrder, againCount: FieldValue.increment(1), lastSeenAt: reviewTs});
      tx.update(assignmentRef!, {nextQueueOrder: nextQueueOrder + 1, updatedAt: reviewTs, hideFromAssignmentsTabUntilFirstProgress: false});
      return {...unchanged, assignmentCompleted: false};
    }

    const completed = storedCompleted + 1;
    const assignmentCompleted = total > 0 && completed >= total;

    tx.update(questionRef!, {status: "DONE", answeredAt: reviewTs});
    const assignmentUpdate: Record<string, unknown> = {completedQuestionCount: completed, updatedAt: reviewTs};
    if (assignmentCompleted) {
      assignmentUpdate.completionStatus = "COMPLETED";
      assignmentUpdate.completedAt = reviewTs;
    } else if (completed === 1) {
      // A wave-2+ "Continue review" starts hidden under COMPLETED on Home;
      // clear the flag on the first answer so it moves back to ASSIGNMENTS.
      assignmentUpdate.hideFromAssignmentsTabUntilFirstProgress = false;
    }
    tx.update(assignmentRef!, assignmentUpdate);

    return {...unchanged, completedQuestionCount: completed, assignmentCompleted};
  });
}
