/**
 * Simple smoke test for selectTargetWordsForSession.
 *
 * Run from functions/:
 *   # Using ts-node directly
 *   npx ts-node --compilerOptions '{"module":"CommonJS","moduleResolution":"node"}' src/utils/testSelectTargetWords.ts demo_user
 *
 *   # Or via npm script (see package.json): 
 *   npm run test:select-target-words -- demo_user
 */
import * as admin from "firebase-admin";
import { selectTargetWordsForSession } from "./selectTargetWordsForSession";

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

async function main(): Promise<void> {
  const userIdArg = process.argv[2] || "demo_user";

  console.log(`Selecting target words for userId="${userIdArg}"...`);

  // Default run (use maxWords: 30, newestLimit: 30 for sentence practice)
  const words = await selectTargetWordsForSession(userIdArg, {
    maxWords: 15,
  });

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

