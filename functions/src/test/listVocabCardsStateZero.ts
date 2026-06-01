/**
 * Lists all vocab_cards for a user with FSRS state === 0 (New).
 *
 * Run from functions/:
 *   npm run test:vocab-state-zero
 *   npm run test:vocab-state-zero -- OTHER_USER_ID
 */
import * as admin from "firebase-admin";
import {ensureFirebaseApp} from "./firebaseInit";

const DEFAULT_USER_ID = "40orwbMb1DdMR1yJ2ryPisctQT52";

ensureFirebaseApp();

async function main(): Promise<void> {
  const userId = process.argv[2] ?? DEFAULT_USER_ID;
  const db = admin.firestore();

  console.log(`Query: vocab_cards where userId == "${userId}" AND state == 0\n`);

  const snap = await db
    .collection("vocab_cards")
    .where("userId", "==", userId)
    .where("state", "==", 2)
    .get();

  console.log(`Found ${snap.size} card(s) with state == 0.\n`);

  if (snap.empty) {
    return;
  }

  snap.docs.forEach((doc, i) => {
    const data = doc.data();
    const spanish = (data.learningLanguageWord as string) ?? "";
    const english = (data.englishWord as string) ?? "";
    console.log(`${i + 1}. ${doc.id}`);
    console.log(`   ${spanish} | ${english}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
