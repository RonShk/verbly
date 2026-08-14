/**
 * Guard rails for students with no vocab words.
 *
 * Regression cover for the bug where a student whose tutor hadn't assigned any
 * words got an error screen, and every Home visit (6s dwell prefetch) plus every
 * retry kicked off another doomed AI generation — an endless regeneration loop.
 *
 * Runs entirely against the **Firestore emulator** and refuses to start without
 * FIRESTORE_EMULATOR_HOST, so it never touches production. No Gemini calls: the
 * point of the fix is that generation is never started, and the one case that
 * would start it is asserted at the `generationStatus: "generating"` flip
 * (the worker itself is a Firestore trigger and isn't running here).
 *
 *   firebase emulators:start --only firestore --project demo-vocab-forge
 *   npm run test:no-vocab-guard-rails
 */
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import functionsTest from "firebase-functions-test";
import {getTodayDateString, prepareContinueReviewWave, resolveDailySessionStatus} from "../assignments/sentence-practice/shared/home-status/dailySessionStatus";
import {selectTargetWordsForSession} from "../assignments/sentence-practice/shared/question-generation/trigger/helpers/selectTargetWordsForSession";
import {NO_VOCAB_STATUS} from "../assignments/sentence-practice/shared/core/generationStatus";
import {resolveTodayVocabSession} from "../assignments/vocab/dailyVocabAssignment";
import {enqueueSessionGeneration} from "../assignments/sentence-practice/shared/question-generation/enqueue/enqueueSessionGeneration";

const PROJECT_ID = "demo-vocab-forge";
const USER_ID = "no-vocab-test-uid";
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

async function wipe(db: admin.firestore.Firestore): Promise<void> {
  for (const path of ["student_vocab", "user_assignments"]) {
    const docs = await db.collection(path).listDocuments();
    for (const doc of docs) await db.recursiveDelete(doc);
  }
}

/** Adds `count` review cards that are not due until next week. */
async function seedCards(db: admin.firestore.Firestore, count: number, dueDaysFromNow: number): Promise<string[]> {
  const cards = db.collection("student_vocab").doc(USER_ID).collection("cards");
  const batch = db.batch();
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const word = `palabra${i}`;
    words.push(word);
    batch.set(cards.doc(`card-${i}`), {
      learningLanguageWord: word,
      englishWord: `word${i}`,
      due: Timestamp.fromDate(new Date(Date.now() + dueDaysFromNow * 86_400_000)),
      stability: 20, difficulty: 5, elapsedDays: 10, scheduledDays: 20,
      learningSteps: 0, reps: 4, lapses: 0, state: 2,
      lastReview: Timestamp.fromDate(new Date(Date.now() - 10 * 86_400_000)),
      createdAt: Timestamp.now(),
    });
  }
  await batch.commit();
  return words;
}

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not set.");
    console.error("Start the emulator first: firebase emulators:start --only firestore --project demo-vocab-forge");
    process.exit(1);
  }

  admin.initializeApp({projectId: PROJECT_ID});
  const db = admin.firestore();
  const testEnv = functionsTest({projectId: PROJECT_ID});
  const callEnqueue = testEnv.wrap(enqueueSessionGeneration) as unknown as (data: unknown, ctx: unknown) => Promise<Record<string, unknown>>;
  const auth = {auth: {uid: USER_ID}};

  await wipe(db);

  console.log("\n1. Translation/Production with no words assigned");
  const stub = await resolveDailySessionStatus(USER_ID, "TRANSLATION", TZ_OFFSET);
  const assignmentRef = db.collection("user_assignments").doc(stub.assignmentId!);

  const first = await callEnqueue({assignmentId: stub.assignmentId}, auth);
  check("enqueue reports no_vocab", first.status === NO_VOCAB_STATUS, first.status);
  const afterFirst = (await assignmentRef.get()).data() ?? {};
  check("assignment is NOT flipped to generating", afterFirst.generationStatus === NO_VOCAB_STATUS, afterFirst.generationStatus);
  check("no error message is stored", afterFirst.generationError === undefined, afterFirst.generationError);

  // The loop: Home's dwell prefetch fires on every visit, and the old code
  // re-triggered generation each time because the status was "failed".
  const writeTimeAfterFirst = (await assignmentRef.get()).updateTime;
  for (let i = 0; i < 5; i++) {
    const repeat = await callEnqueue({assignmentId: stub.assignmentId}, auth);
    check(`repeat enqueue #${i + 1} stays no_vocab`, repeat.status === NO_VOCAB_STATUS, repeat.status);
  }
  const afterRepeats = await assignmentRef.get();
  check("repeat enqueues write nothing (no re-trigger)", afterRepeats.updateTime?.isEqual(writeTimeAfterFirst!) === true);
  check("still never entered generating", afterRepeats.data()?.generationStatus === NO_VOCAB_STATUS);

  console.log("\n2. Vocab with no words assigned");
  const emptyVocab = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("reports deckIsEmpty", emptyVocab.deckIsEmpty === true, emptyVocab.deckIsEmpty);
  check("draws no cards", emptyVocab.questions.length === 0, emptyVocab.questions.length);
  check("total is 0", emptyVocab.totalQuestionCount === 0, emptyVocab.totalQuestionCount);

  console.log("\n3. Words exist but none are due today");
  const words = await seedCards(db, 6, 7);
  const notDueVocab = await resolveTodayVocabSession(USER_ID, TZ_OFFSET);
  check("vocab does NOT report deckIsEmpty", notDueVocab.deckIsEmpty === false, notDueVocab.deckIsEmpty);
  check("vocab still draws nothing (nothing due)", notDueVocab.questions.length === 0, notDueVocab.questions.length);

  // Sentence practice deliberately differs from daily vocab here: it may use
  // not-yet-due words, so a stocked deck always has something to generate from.
  const targets = await selectTargetWordsForSession(USER_ID, {maxWords: 30, timezoneOffsetMinutes: TZ_OFFSET});
  check("sentence practice uses not-yet-due words", targets.length === 6, targets.length);

  console.log("\n4. Every word used recently (the small-deck case)");
  await db.collection("user_assignments").add({
    userId: USER_ID,
    type: "TRANSLATION",
    assignmentDate: "2020-01-01",
    completionStatus: "COMPLETED",
    createdAt: Timestamp.now(),
    vocabWordKeysUsed: words,
  });
  const afterRecentUse = await selectTargetWordsForSession(USER_ID, {maxWords: 30, timezoneOffsetMinutes: TZ_OFFSET});
  check("falls back to the deck instead of returning nothing", afterRecentUse.length === 6, afterRecentUse.length);

  console.log("\n5. Generation resumes once the tutor adds words");
  const resumed = await callEnqueue({assignmentId: stub.assignmentId, timezoneOffsetMinutes: TZ_OFFSET}, auth);
  check("enqueue leaves no_vocab behind", resumed.status === "generating", resumed.status);
  const afterResume = (await assignmentRef.get()).data() ?? {};
  check("assignment flips to generating", afterResume.generationStatus === "generating", afterResume.generationStatus);

  console.log("\n6. Failed generation reuses the existing assignment");
  await assignmentRef.update({generationStatus: "failed", completionStatus: "COMPLETED", completedQuestionCount: 0});
  const retryStatus = await resolveDailySessionStatus(USER_ID, "TRANSLATION", TZ_OFFSET);
  check("failed assignment is returned for retry", retryStatus.assignmentId === stub.assignmentId, retryStatus.assignmentId);
  const retryWave = await prepareContinueReviewWave(USER_ID, "TRANSLATION", TZ_OFFSET);
  check("continue review reuses failed assignment", retryWave.assignmentId === stub.assignmentId, retryWave.assignmentId);
  const assignmentCount = (await db.collection("user_assignments").where("userId", "==", USER_ID).where("type", "==", "TRANSLATION").where("assignmentDate", "==", getTodayDateString(TZ_OFFSET)).get()).size;
  check("no extra failed stub is created", assignmentCount === 1, assignmentCount);

  testEnv.cleanup();
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
