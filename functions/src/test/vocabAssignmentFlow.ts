/**
 * End-to-end check of the persisted daily vocab assignment (issue: vocab of the
 * day was cache-only and reset on refresh).
 *
 * Drives the real module functions against the **Firestore emulator** — it
 * refuses to run without FIRESTORE_EMULATOR_HOST so it can never touch
 * production data. Covers: wave creation, refresh/cold-start rehydration,
 * "Again" re-queueing, progress persistence mid-session, wave completion, and
 * the "Continue review" wave.
 *
 *   firebase emulators:start --only firestore --project demo-vocab-forge
 *   npm run test:vocab-assignment-flow
 */
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import functionsTest from "firebase-functions-test";
// Safe to import statically: these modules resolve admin.firestore() lazily,
// inside the functions, so nothing touches Firestore before initializeApp().
import {resolveTodayVocabSession, loadVocabSessionById, prepareVocabContinueReviewWave} from "../assignments/vocab/dailyVocabAssignment";
import {recordVocabReview} from "../assignments/vocab/recordVocabReview";
import {getVocabSession} from "../assignments/vocab/getVocabSession";
import {recordVocabResponse} from "../assignments/vocab/recordVocabResponse";
import {prepareVocabContinueReview} from "../assignments/vocab/prepareVocabContinueReview";

const PROJECT_ID = "demo-vocab-forge";
const USER_ID = "test-student-uid";
const TZ_OFFSET = -480;

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures++;
  console.error(`  ✗ ${label}${detail === undefined ? "" : ` — got ${JSON.stringify(detail)}`}`);
}

function reviewCardFields(dueDaysFromNow: number, state: number) {
  const due = new Date(Date.now() + dueDaysFromNow * 86_400_000);
  return {
    due: Timestamp.fromDate(due),
    stability: 10,
    difficulty: 5,
    elapsedDays: 10,
    scheduledDays: 10,
    learningSteps: 0,
    reps: 3,
    lapses: 0,
    state,
    lastReview: Timestamp.fromDate(new Date(Date.now() - 10 * 86_400_000)),
    createdAt: Timestamp.now(),
  };
}

function newCardFields() {
  return {
    due: Timestamp.now(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: null,
    createdAt: Timestamp.now(),
  };
}

/** Wipes and reseeds the deck: 5 new, 12 review due today, 3 review due later. */
async function seedDeck(db: admin.firestore.Firestore): Promise<void> {
  for (const path of ["student_vocab", "user_assignments"]) {
    const docs = await db.collection(path).listDocuments();
    for (const doc of docs) await db.recursiveDelete(doc);
  }

  const cards = db.collection("student_vocab").doc(USER_ID).collection("cards");
  const batch = db.batch();
  for (let i = 0; i < 5; i++) {
    batch.set(cards.doc(`new-${i}`), {learningLanguageWord: `nuevo${i}`, englishWord: `new${i}`, ...newCardFields()});
  }
  for (let i = 0; i < 12; i++) {
    batch.set(cards.doc(`due-${i}`), {learningLanguageWord: `debido${i}`, englishWord: `due${i}`, ...reviewCardFields(-1, 2)});
  }
  for (let i = 0; i < 3; i++) {
    batch.set(cards.doc(`later-${i}`), {learningLanguageWord: `luego${i}`, englishWord: `later${i}`, ...reviewCardFields(7, 2)});
  }
  await batch.commit();
}

type Callable = (data: unknown, context: unknown) => Promise<Record<string, unknown>>;

/** Asserts that [run] rejects with the given functions.https.HttpsError code. */
async function expectHttpsError(label: string, code: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
    check(label, false, "no error thrown");
  } catch (err) {
    check(label, (err as {code?: string}).code === code, (err as {code?: string}).code);
  }
}

/**
 * Exercises the deployed callables themselves (auth guard, argument
 * validation, request/response plumbing) rather than the modules underneath.
 */
async function runCallableChecks(db: admin.firestore.Firestore): Promise<void> {
  const testEnv = functionsTest({projectId: PROJECT_ID});
  const callGetSession = testEnv.wrap(getVocabSession) as unknown as Callable;
  const callRecord = testEnv.wrap(recordVocabResponse) as unknown as Callable;
  const callPrepare = testEnv.wrap(prepareVocabContinueReview) as unknown as Callable;
  const auth = {auth: {uid: USER_ID}};

  await seedDeck(db);

  console.log("\n9. Callables");
  await expectHttpsError("getVocabSession rejects anonymous callers", "unauthenticated", () => callGetSession({}, {}));
  await expectHttpsError("recordVocabResponse rejects anonymous callers", "unauthenticated", () => callRecord({}, {}));
  await expectHttpsError("prepareVocabContinueReview rejects anonymous callers", "unauthenticated", () => callPrepare({}, {}));

  const session = await callGetSession({timezoneOffsetMinutes: TZ_OFFSET}, auth);
  const questions = session.questions as Array<{index: number; vocabCardId: string}>;
  check("getVocabSession returns today's wave", questions.length === 15, questions.length);
  const legacy = await callGetSession({assignmentId: "daily-vocab", timezoneOffsetMinutes: TZ_OFFSET}, auth);
  check("legacy 'daily-vocab' id resolves to the same wave", legacy.assignmentId === session.assignmentId);

  await expectHttpsError("recordVocabResponse validates vocabCardId", "invalid-argument", () => callRecord({rating: 3}, auth));
  await expectHttpsError("recordVocabResponse validates rating", "invalid-argument", () => callRecord({vocabCardId: questions[0].vocabCardId, rating: 9}, auth));
  await expectHttpsError("recordVocabResponse 404s an unknown card", "not-found", () => callRecord({vocabCardId: "no-such-card", rating: 3}, auth));

  const recorded = await callRecord({assignmentId: session.assignmentId, questionIndex: questions[0].index, vocabCardId: questions[0].vocabCardId, rating: 4, timezoneOffsetMinutes: TZ_OFFSET}, auth);
  check("recordVocabResponse advances the wave", recorded.completedQuestionCount === 1, recorded.completedQuestionCount);
  const reloaded = await callGetSession({assignmentId: session.assignmentId, timezoneOffsetMinutes: TZ_OFFSET}, auth);
  check("progress is visible on the next call", reloaded.completedQuestionCount === 1, reloaded.completedQuestionCount);
  check("the answered card is gone", (reloaded.questions as unknown[]).length === 14, (reloaded.questions as unknown[]).length);

  const prepared = await callPrepare({timezoneOffsetMinutes: TZ_OFFSET}, auth);
  check("prepareVocabContinueReview returns the open wave", prepared.assignmentId === session.assignmentId, prepared.assignmentId);

  testEnv.cleanup();
}

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set.");
    console.error("Start the emulator first: firebase emulators:start --only firestore --project demo-vocab-forge");
    process.exit(1);
  }

  admin.initializeApp({projectId: PROJECT_ID});
  const db = admin.firestore();

  await seedDeck(db);

  console.log("\n1. First load creates and persists the day's wave");
  const wave1 = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("draws 15 cards (5 new + 10 review, capped)", wave1.questions.length === 15, wave1.questions.length);
  check("excludes cards due later in the week", wave1.questions.every((q) => !q.vocabCardId.startsWith("later-")));
  check("assignmentId is a real Firestore id", wave1.assignmentId.length > 0 && wave1.assignmentId !== "daily-vocab", wave1.assignmentId);
  check("starts as TODO", wave1.completionStatus === "TODO", wave1.completionStatus);

  const assignmentDoc = await db.collection("user_assignments").doc(wave1.assignmentId).get();
  check("assignment doc written with type VOCAB", assignmentDoc.data()?.type === "VOCAB", assignmentDoc.data()?.type);
  check("assignment doc is scoped to the user", assignmentDoc.data()?.userId === USER_ID);
  const questionDocs = await db.collection("user_assignments").doc(wave1.assignmentId).collection("questions").get();
  check("15 question docs persisted", questionDocs.size === 15, questionDocs.size);

  console.log("\n2. Refresh / cold start returns the same wave (the reported bug)");
  const afterRefresh = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("same assignmentId", afterRefresh.assignmentId === wave1.assignmentId, afterRefresh.assignmentId);
  check("same cards in the same order", JSON.stringify(afterRefresh.questions) === JSON.stringify(wave1.questions));
  const allWaves = await db.collection("user_assignments").get();
  check("no duplicate wave created", allWaves.size === 1, allWaves.size);
  const byId = await loadVocabSessionById(USER_ID, wave1.assignmentId);
  check("deep link by id resolves the same wave", byId?.assignmentId === wave1.assignmentId);
  check("another user cannot load it", (await loadVocabSessionById("someone-else", wave1.assignmentId)) === null);
  check("unknown id falls back to null", (await loadVocabSessionById(USER_ID, "daily-vocab")) === null);

  console.log("\n3. Rating 'Again' re-queues the card instead of completing it");
  const first = wave1.questions[0];
  const again = await recordVocabReview(USER_ID, {vocabCardId: first.vocabCardId, rating: 1, assignmentId: wave1.assignmentId, questionIndex: first.index, timezoneOffsetMinutes: TZ_OFFSET});
  check("still due today", again.stillDueToday === true);
  check("completed count unchanged", again.completedQuestionCount === 0, again.completedQuestionCount);
  const afterAgain = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("card still in the wave after reload", afterAgain.questions.length === 15, afterAgain.questions.length);
  check("re-queued to the back", afterAgain.questions[afterAgain.questions.length - 1].vocabCardId === first.vocabCardId, afterAgain.questions[afterAgain.questions.length - 1].vocabCardId);
  check("wave is no longer hidden from the assignments list", afterAgain.completionStatus === "TODO");

  console.log("\n4. Progress persists mid-session");
  const easy = afterAgain.questions.filter((q) => q.vocabCardId !== first.vocabCardId).slice(0, 4);
  for (const q of easy) {
    const res = await recordVocabReview(USER_ID, {vocabCardId: q.vocabCardId, rating: 4, assignmentId: wave1.assignmentId, questionIndex: q.index, timezoneOffsetMinutes: TZ_OFFSET});
    check(`card ${q.vocabCardId} graduates out of today`, res.stillDueToday === false);
  }
  const midSession = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("completed count survived the reload", midSession.completedQuestionCount === 4, midSession.completedQuestionCount);
  check("answered cards are gone from the queue", midSession.questions.length === 11, midSession.questions.length);
  check("total still reports the full wave", midSession.totalQuestionCount === 15, midSession.totalQuestionCount);

  console.log("\n5. Double-rating the same question does not double-count");
  const repeat = easy[0];
  const dup = await recordVocabReview(USER_ID, {vocabCardId: repeat.vocabCardId, rating: 4, assignmentId: wave1.assignmentId, questionIndex: repeat.index, timezoneOffsetMinutes: TZ_OFFSET});
  check("completed count held at 4", dup.completedQuestionCount === 4, dup.completedQuestionCount);

  console.log("\n6. Finishing every card completes the wave");
  let remaining = (await resolveTodayVocabSession(USER_ID, TZ_OFFSET)).questions;
  let guard = 0;
  while (remaining.length > 0 && guard++ < 60) {
    const q = remaining[0];
    await recordVocabReview(USER_ID, {vocabCardId: q.vocabCardId, rating: 4, assignmentId: wave1.assignmentId, questionIndex: q.index, timezoneOffsetMinutes: TZ_OFFSET});
    remaining = (await resolveTodayVocabSession(USER_ID, TZ_OFFSET)).questions;
  }
  const finished = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("no cards left", finished.questions.length === 0, finished.questions.length);
  check("reports COMPLETED", finished.completionStatus === "COMPLETED", finished.completionStatus);
  check("completed == total", finished.completedQuestionCount === finished.totalQuestionCount, [finished.completedQuestionCount, finished.totalQuestionCount]);
  check("a reload after completing does not draw a new wave", finished.assignmentId === wave1.assignmentId);

  console.log("\n7. Continue review starts a persisted wave 2");
  const wave2 = await prepareVocabContinueReviewWave(USER_ID, TZ_OFFSET);
  check("new assignmentId", wave2.assignmentId !== wave1.assignmentId);
  check("carries today's cumulative offset", wave2.cumulativeOffsetQuestionCount === 15, wave2.cumulativeOffsetQuestionCount);
  check("draws the cards that came back due", wave2.questions.length > 0, wave2.questions.length);
  check("hidden under COMPLETED until first answer", wave2.completionStatus === "COMPLETED", wave2.completionStatus);
  const wave2Again = await prepareVocabContinueReviewWave(USER_ID, TZ_OFFSET);
  check("preparing twice is idempotent", wave2Again.assignmentId === wave2.assignmentId);
  check("resolve now returns wave 2", (await resolveTodayVocabSession(USER_ID, TZ_OFFSET)).assignmentId === wave2.assignmentId);

  const w2q = wave2.questions[0];
  await recordVocabReview(USER_ID, {vocabCardId: w2q.vocabCardId, rating: 4, assignmentId: wave2.assignmentId, questionIndex: w2q.index, timezoneOffsetMinutes: TZ_OFFSET});
  const wave2Started = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("moves to TODO once started", wave2Started.completionStatus === "TODO", wave2Started.completionStatus);
  check("offset preserved across the reload", wave2Started.cumulativeOffsetQuestionCount === 15, wave2Started.cumulativeOffsetQuestionCount);

  console.log("\n8. A stale assignment id still records the review");
  const stale = await recordVocabReview(USER_ID, {vocabCardId: "new-0", rating: 3, assignmentId: "", questionIndex: null, timezoneOffsetMinutes: TZ_OFFSET});
  check("returns without throwing", typeof stale.stillDueToday === "boolean");

  await runCallableChecks(db);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
