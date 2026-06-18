/**
 * Migrates flat vocab_cards for one student into student_vocab/{uid}/cards.
 * Strips userId and vocabListId from card docs. Builds deck summary on parent.
 *
 * Usage (from functions/):
 *   npm run migrate:student-vocab
 *   npm run migrate:student-vocab -- OTHER_STUDENT_UID
 */
import * as admin from "firebase-admin";
import {Timestamp} from "firebase-admin/firestore";
import {deckCardsRef, deckRef} from "../assignments/vocab/deck/paths";
import {buildStateCounts} from "../assignments/vocab/deck/summary";

const DEFAULT_STUDENT_UID = "40orwbMb1DdMR1yJ2ryPisctQT52";
const BATCH_SIZE = 400;
const STRIP_FIELDS = ["userId", "vocabListId"];

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

function toTimestamp(raw: unknown): Timestamp | null {
  if (raw == null) return null;
  if (raw instanceof Timestamp) return raw;
  if (raw instanceof Date) return Timestamp.fromDate(raw);
  if (typeof (raw as {toDate?: unknown}).toDate === "function") {
    return raw as Timestamp;
  }
  return null;
}

async function migrateStudent(studentUid: string): Promise<void> {
  const legacySnap = await db.collection("vocab_cards").where("userId", "==", studentUid).get();
  if (legacySnap.empty) {
    console.log(`No vocab_cards found for userId="${studentUid}".`);
    return;
  }

  console.log(`Found ${legacySnap.size} legacy vocab_cards for ${studentUid}.`);

  const studentSnap = await db.doc(`students/${studentUid}`).get();
  const tutorId = (studentSnap.data()?.teacherId as string | null | undefined) ?? null;

  let learningLanguage = "es";
  const knownLanguage = "en";
  const firstListId = legacySnap.docs.map((d) => d.data().vocabListId as string | undefined).find(Boolean);
  if (firstListId) {
    const listSnap = await db.collection("vocab_lists").doc(firstListId).get();
    if (listSnap.exists) {
      learningLanguage = (listSnap.data()?.learningLanguage as string) ?? learningLanguage;
    }
  }

  const states: number[] = [];
  let lastReviewAt: Timestamp | null = null;

  for (const doc of legacySnap.docs) {
    const data = doc.data();
    const state = typeof data.state === "number" ? data.state : 0;
    states.push(state);
    const lastReview = toTimestamp(data.lastReview);
    if (lastReview && (!lastReviewAt || lastReview.toMillis() > lastReviewAt.toMillis())) {
      lastReviewAt = lastReview;
    }
  }

  const now = Timestamp.now();
  const deckDocRef = deckRef(db, studentUid);
  const cardsRef = deckCardsRef(db, studentUid);

  await deckDocRef.set({
    studentUid,
    tutorId,
    learningLanguage,
    knownLanguage,
    totalCards: legacySnap.size,
    stateCounts: buildStateCounts(states),
    lastReviewAt,
    lastActiveAt: null,
    createdAt: now,
    updatedAt: now,
  });

  let batch = db.batch();
  let batchCount = 0;
  let migrated = 0;

  for (const doc of legacySnap.docs) {
    const data = {...doc.data()};
    for (const field of STRIP_FIELDS) delete data[field];

    batch.set(cardsRef.doc(doc.id), data);
    batchCount++;
    migrated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`Migrated ${migrated}/${legacySnap.size} cards...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();

  batch = db.batch();
  batchCount = 0;
  let deleted = 0;
  for (const doc of legacySnap.docs) {
    batch.delete(doc.ref);
    batchCount++;
    deleted++;
    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`Deleted ${deleted}/${legacySnap.size} legacy cards...`);
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();

  const summary = buildStateCounts(states);
  console.log("Migration complete.");
  console.log(`  Deck: ${deckDocRef.path}`);
  console.log(`  Cards migrated: ${migrated}`);
  console.log(`  Legacy deleted: ${deleted}`);
  console.log(`  State counts: new=${summary.new} learning=${summary.learning} review=${summary.review} relearning=${summary.relearning}`);
  console.log(`  tutorId: ${tutorId ?? "null"}`);
}

const studentUid = process.argv[2]?.trim() || DEFAULT_STUDENT_UID;

migrateStudent(studentUid).catch((err) => {
  console.error(err);
  process.exit(1);
});
