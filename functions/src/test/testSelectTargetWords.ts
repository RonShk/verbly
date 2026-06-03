/**
 * Single-run smoke test for selectTargetWordsForSession.
 *
 * Run from functions/:
 *   npm run test:select-target-words -- YOUR_USER_ID
 */
import {selectTargetWordsForSession} from "../assignments/sentence-practice/shared/question-generation/trigger/helpers/selectTargetWordsForSession";
import {ensureFirebaseApp} from "./firebaseInit";

ensureFirebaseApp();

async function main(): Promise<void> {
  const userIdArg = process.argv[2];
  if (!userIdArg) {
    console.error("Usage: npm run test:select-target-words -- <userId>");
    process.exit(1);
  }

  console.log(`Selecting target words for userId="${userIdArg}"...`);

  const words = await selectTargetWordsForSession(userIdArg, {maxWords: 30});

  if (words.length === 0) {
    console.log("No target words found (vocab_cards may be empty for this user).");
    return;
  }

  const byBucket: Record<string, number> = {};
  for (const w of words) {
    byBucket[w.priorityBucket] = (byBucket[w.priorityBucket] ?? 0) + 1;
  }

  console.log("\nSummary by bucket:");
  for (const [bucket, count] of Object.entries(byBucket)) {
    console.log(`  ${bucket}: ${count}`);
  }

  console.log("\nSelected words (in order):");
  words.forEach((w, i) => {
    console.log(
      `${i + 1}. [${w.priorityBucket}] ${w.learningLanguageWord} -> ${w.englishWord}`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
