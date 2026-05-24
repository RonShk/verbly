/**
 * Sets userId on every document in vocab_cards.
 *
 * Requires Firebase credentials (GOOGLE_APPLICATION_CREDENTIALS or
 * gcloud auth application-default login).
 *
 * Usage (from functions/):
 *   npm run migrate:vocab-cards-user-id
 *   npm run migrate:vocab-cards-user-id -- jp9g6HQfKIgS5b88miVr727IZ632
 */

import * as admin from "firebase-admin";

const DEFAULT_USER_ID = "jp9g6HQfKIgS5b88miVr727IZ632";
const BATCH_SIZE = 500;

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function migrateVocabCardsUserId(targetUserId: string): Promise<void> {
  const snap = await db.collection("vocab_cards").get();
  if (snap.empty) {
    console.log("No vocab_cards documents found.");
    return;
  }

  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const currentUserId = doc.data().userId;
    if (currentUserId === targetUserId) continue;

    batch.update(doc.ref, {userId: targetUserId});
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`Committed ${updated} update(s) so far...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`Done. Updated ${updated} of ${snap.size} vocab_cards doc(s) to userId="${targetUserId}".`);
}

const targetUserId = process.argv[2]?.trim() || DEFAULT_USER_ID;

migrateVocabCardsUserId(targetUserId).catch((err) => {
  console.error(err);
  process.exit(1);
});
