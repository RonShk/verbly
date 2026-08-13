import * as admin from "firebase-admin";
import {Timestamp, type DocumentReference, type DocumentSnapshot, type QueryDocumentSnapshot} from "firebase-admin/firestore";
import {deckCardsRef} from "./deck/paths";
import {isDeckEmpty} from "./deck/deckSize";
import {getTodayDateString} from "../../utils/localDate";

/**
 * Vocab assignments live in the same unified `user_assignments` collection as
 * sentence practice (issue #58), with `type: "VOCAB"`. Each daily wave is one
 * doc; the cards drawn for that wave are persisted as docs in its `questions`
 * subcollection so the session survives an app refresh or restart.
 *
 * Unlike Translation/Production the question list is a *queue*: a card rated
 * "Again" stays PENDING and is pushed to the back (`queueOrder` bumped to the
 * assignment's `nextQueueOrder`), so it reappears later in the same wave. A
 * card whose new due date is past today is marked DONE and increments
 * `completedQuestionCount`.
 */
export const ASSIGNMENTS_COLLECTION = "user_assignments";
export const QUESTIONS_SUBCOLLECTION = "questions";
export const VOCAB_TYPE = "VOCAB";
export const VOCAB_ASSIGNMENT_TITLE = "Daily Vocab";

/** Max new cards per day: 5 new + up to 10 learning/review = 15 total. */
const NEW_CARD_LIMIT = 5;
/** Total cards in one daily wave. We always fill up to this when possible. */
const DAILY_SESSION_CAP = 15;

export type VocabQuestionStatus = "PENDING" | "DONE";
export type CompletionStatus = "TODO" | "COMPLETED";

/** One card as stored in the assignment's `questions` subcollection. */
export interface VocabQuestionDoc {
  index: number;
  vocabCardId: string;
  learningLanguageWord: string;
  englishWord: string;
  isNew: boolean;
}

/** Payload returned to the client by getVocabSession / prepareVocabContinueReview. */
export interface VocabSessionDto {
  assignmentId: string;
  type: string;
  assignmentTitle: string;
  teacher: string;
  completionStatus: CompletionStatus;
  totalQuestionCount: number;
  completedQuestionCount: number;
  cumulativeOffsetQuestionCount: number;
  questions: VocabQuestionDoc[];
  /**
   * True when the student has no vocab cards at all (their tutor hasn't
   * assigned any words). Distinguishes "nothing left to do today" — the normal
   * finished state — from "nothing to do, ever", which needs its own message.
   */
  deckIsEmpty: boolean;
}

interface VocabCard extends VocabQuestionDoc {
  state: number;
  due: Date;
}

function db() {
  return admin.firestore();
}

export function assignmentsCollection() {
  return db().collection(ASSIGNMENTS_COLLECTION);
}

export function vocabQuestionRef(assignmentRef: DocumentReference, index: number): DocumentReference {
  return assignmentRef.collection(QUESTIONS_SUBCOLLECTION).doc(String(index));
}

function endOfUserDay(utcOffsetMinutes: number): Date {
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

/**
 * Picks the cards for one wave, in the order they should be shown:
 * learning/relearning (all) → new (up to NEW_CARD_LIMIT) → review due today,
 * truncated to DAILY_SESSION_CAP and de-duplicated by word pair.
 */
async function selectWaveCards(userId: string, utcOffsetMinutes: number): Promise<{questions: VocabQuestionDoc[]; deckIsEmpty: boolean}> {
  const snap = await deckCardsRef(db(), userId).get();
  if (snap.empty) return {questions: [], deckIsEmpty: true};

  const cutoff = endOfUserDay(utcOffsetMinutes);
  const reviewCards: VocabCard[] = [];
  const learningCards: VocabCard[] = [];
  const newCards: VocabCard[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const state = typeof data.state === "number" ? data.state : -1;
    const dueRaw = data.due;
    const due: Date =
      dueRaw && typeof dueRaw.toDate === "function" ? dueRaw.toDate(): dueRaw instanceof Date ? dueRaw : new Date(0);

    const card: VocabCard = {
      index: 0,
      vocabCardId: doc.id,
      learningLanguageWord: (data.learningLanguageWord as string) ?? "",
      englishWord: (data.englishWord as string) ?? "",
      isNew: state === 0,
      state,
      due,
    };

    if (state === 0) {
      newCards.push(card);
    } else if (state === 1 || state === 3) {
      learningCards.push(card);
    } else if (due <= cutoff) {
      reviewCards.push(card);
    }
  }

  const orderedCards = [...learningCards, ...newCards.slice(0, NEW_CARD_LIMIT), ...reviewCards];

  const seen = new Set<string>();
  const questions: VocabQuestionDoc[] = [];
  for (const card of orderedCards) {
    if (questions.length >= DAILY_SESSION_CAP) break;
    const key = `${card.learningLanguageWord}|${card.englishWord}`;
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push({
      index: questions.length,
      vocabCardId: card.vocabCardId,
      learningLanguageWord: card.learningLanguageWord,
      englishWord: card.englishWord,
      isNew: card.isNew,
    });
  }

  return {questions, deckIsEmpty: false};
}

/**
 * Creates a new vocab wave for today: one `user_assignments` doc plus one
 * question doc per drawn card. A wave with no due cards is written already
 * COMPLETED so Home does not show an empty assignment.
 */
async function createVocabWave(userId: string, utcOffsetMinutes: number, cumulativeOffsetQuestionCount: number, hideUntilFirstProgress: boolean): Promise<VocabSessionDto> {
  const {questions, deckIsEmpty} = await selectWaveCards(userId, utcOffsetMinutes);
  const total = questions.length;
  const now = Timestamp.now();
  const assignmentRef = assignmentsCollection().doc();
  const storedStatus: CompletionStatus = total === 0 ? "COMPLETED" : "TODO";

  const batch = db().batch();
  batch.set(assignmentRef, {
    userId,
    type: VOCAB_TYPE,
    teacher: "",
    assignmentDate: getTodayDateString(utcOffsetMinutes),
    createdAt: now,
    completionStatus: storedStatus,
    completedAt: total === 0 ? now : null,
    totalQuestionCount: total,
    completedQuestionCount: 0,
    cumulativeOffsetQuestionCount,
    // Queue positions past the initial fill; bumped each time a card is
    // re-queued so "Again" cards always land at the back.
    nextQueueOrder: total,
    hideFromAssignmentsTabUntilFirstProgress: hideUntilFirstProgress,
    timezoneOffsetMinutes: utcOffsetMinutes,
  });

  for (const q of questions) {
    batch.set(vocabQuestionRef(assignmentRef, q.index), {
      userId,
      ...q,
      queueOrder: q.index,
      status: "PENDING" as VocabQuestionStatus,
      againCount: 0,
      answeredAt: null,
    });
  }

  await batch.commit();

  return {
    assignmentId: assignmentRef.id,
    type: VOCAB_TYPE,
    assignmentTitle: VOCAB_ASSIGNMENT_TITLE,
    teacher: "",
    // Same rule the read path applies: a wave that starts hidden reports
    // COMPLETED so Home keeps it under COMPLETED until the first answer.
    completionStatus: storedStatus === "COMPLETED" || hideUntilFirstProgress ? "COMPLETED" : "TODO",
    totalQuestionCount: total,
    completedQuestionCount: 0,
    cumulativeOffsetQuestionCount,
    questions,
    deckIsEmpty,
  };
}

/** Reads the still-PENDING questions of a wave, in queue order. */
async function loadPendingQuestions(assignmentRef: DocumentReference): Promise<VocabQuestionDoc[]> {
  // Ordered by a single field so no composite index is needed; PENDING is
  // filtered in memory (a wave is at most DAILY_SESSION_CAP cards).
  const snap = await assignmentRef.collection(QUESTIONS_SUBCOLLECTION).orderBy("queueOrder").get();
  return snap.docs
    .filter((d) => (d.data().status as VocabQuestionStatus) !== "DONE")
    .map((d) => {
      const data = d.data();
      return {
        index: (data.index as number) ?? Number(d.id),
        vocabCardId: (data.vocabCardId as string) ?? "",
        learningLanguageWord: (data.learningLanguageWord as string) ?? "",
        englishWord: (data.englishWord as string) ?? "",
        isNew: (data.isNew as boolean) ?? false,
      };
    });
}

/**
 * Builds the client payload for an existing wave.
 *
 * A wave-2+ that has not been answered yet reports COMPLETED (mirroring the
 * `hideFromAssignmentsTabUntilFirstProgress` rule for Translation/Production)
 * so Home keeps it under COMPLETED until the user rates the first card.
 */
export async function toVocabSessionDto(doc: DocumentSnapshot): Promise<VocabSessionDto> {
  const data = doc.data() ?? {};
  const completed = (data.completedQuestionCount as number | undefined) ?? 0;
  const hideUntilFirstProgress = (data.hideFromAssignmentsTabUntilFirstProgress as boolean | undefined) ?? false;
  const storedStatus = (data.completionStatus as CompletionStatus | undefined) ?? "TODO";
  const completionStatus: CompletionStatus = storedStatus === "COMPLETED" || (hideUntilFirstProgress && completed === 0) ? "COMPLETED" : "TODO";
  const total = (data.totalQuestionCount as number | undefined) ?? 0;
  const questions = await loadPendingQuestions(doc.ref);

  // Only worth a read when the wave is empty and always was: if it drew any
  // cards, the deck plainly isn't empty. Keeps the common path at zero extra cost.
  const deckIsEmpty = total === 0 && questions.length === 0 ? await isDeckEmpty(data.userId as string) : false;

  return {
    assignmentId: doc.id,
    type: VOCAB_TYPE,
    assignmentTitle: VOCAB_ASSIGNMENT_TITLE,
    teacher: (data.teacher as string | undefined) ?? "",
    completionStatus,
    totalQuestionCount: total,
    completedQuestionCount: completed,
    cumulativeOffsetQuestionCount: (data.cumulativeOffsetQuestionCount as number | undefined) ?? 0,
    questions,
    deckIsEmpty,
  };
}

function createdAtMillis(doc: QueryDocumentSnapshot): number {
  const ts = doc.data().createdAt;
  return ts instanceof Timestamp ? ts.toMillis() : 0;
}

async function todaysVocabDocs(userId: string, utcOffsetMinutes: number): Promise<QueryDocumentSnapshot[]> {
  const snap = await assignmentsCollection()
    .where("userId", "==", userId)
    .where("type", "==", VOCAB_TYPE)
    .where("assignmentDate", "==", getTodayDateString(utcOffsetMinutes))
    .get();
  return snap.docs;
}

/**
 * Returns today's vocab wave, creating the first one on demand.
 *
 * Resolution order:
 *  1. An active (not COMPLETED) wave → that one.
 *  2. No wave at all today → create wave 1.
 *  3. Only completed waves → the most recent, so Home renders COMPLETED with
 *     today's cumulative totals.
 */
export async function resolveTodayVocabSession(userId: string, utcOffsetMinutes: number): Promise<VocabSessionDto> {
  const docs = await todaysVocabDocs(userId, utcOffsetMinutes);

  const active = docs.filter((d) => d.data().completionStatus !== "COMPLETED").sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
  if (active.length > 0) return toVocabSessionDto(active[0]);

  if (docs.length === 0) return createVocabWave(userId, utcOffsetMinutes, 0, false);

  const newestCompleted = docs.sort((a, b) => createdAtMillis(b) - createdAtMillis(a))[0];
  return toVocabSessionDto(newestCompleted);
}

/**
 * Creates (or returns) a "Continue review" wave for today. Idempotent: if an
 * active wave already exists it is returned untouched. A fresh wave starts
 * hidden from the ASSIGNMENTS list until the first answer and carries
 * `cumulativeOffsetQuestionCount` = sum of today's completed wave totals.
 */
export async function prepareVocabContinueReviewWave(userId: string, utcOffsetMinutes: number): Promise<VocabSessionDto> {
  const docs = await todaysVocabDocs(userId, utcOffsetMinutes);

  const active = docs.filter((d) => d.data().completionStatus !== "COMPLETED").sort((a, b) => createdAtMillis(b) - createdAtMillis(a));
  if (active.length > 0) return toVocabSessionDto(active[0]);

  let cumulativeOffset = 0;
  for (const d of docs) {
    if (d.data().completionStatus === "COMPLETED") cumulativeOffset += (d.data().totalQuestionCount as number | undefined) ?? 0;
  }

  return createVocabWave(userId, utcOffsetMinutes, cumulativeOffset, true);
}

/**
 * Loads a specific wave by id, verifying ownership. Returns null when the id is
 * unknown (e.g. the legacy `daily-vocab` sentinel or a stale deep link) so the
 * caller can fall back to resolving today's wave.
 */
export async function loadVocabSessionById(userId: string, assignmentId: string): Promise<VocabSessionDto | null> {
  const doc = await assignmentsCollection().doc(assignmentId).get();
  if (!doc.exists) return null;
  const data = doc.data() ?? {};
  if (data.userId !== userId || data.type !== VOCAB_TYPE) return null;
  return toVocabSessionDto(doc);
}
