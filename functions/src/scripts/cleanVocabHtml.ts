/**
 * Finds vocab_cards with HTML in word fields. Pass --apply to strip and save.
 *
 * Requires Firebase credentials (GOOGLE_APPLICATION_CREDENTIALS or
 * gcloud auth application-default login).
 *
 * Usage (from functions/):
 *   npm run strip-html
 *   npm run strip-html -- --apply
 */

import * as admin from "firebase-admin";

const BATCH_SIZE = 500;
const HTML_TAG_PATTERN = /<[^>]*>/g;
const APPLY = process.argv.includes("--apply");

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

function stripHtml(text: string): string {
  return text.replace(HTML_TAG_PATTERN, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

function hasHtml(text: string): boolean {
  HTML_TAG_PATTERN.lastIndex = 0;
  return HTML_TAG_PATTERN.test(text) || /[<>]/.test(text);
}

async function scanVocabCards(): Promise<number> {
  const snap = await db.collection("vocab_cards").get();
  let found = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const learningLanguageWord = data.learningLanguageWord;
    const englishWord = data.englishWord;
    const learningHasHtml = typeof learningLanguageWord === "string" && hasHtml(learningLanguageWord);
    const englishHasHtml = typeof englishWord === "string" && hasHtml(englishWord);
    if (!learningHasHtml && !englishHasHtml) continue;

    found++;
    console.log(doc.id);
  }

  return found;
}

async function applyVocabCards(): Promise<number> {
  const snap = await db.collection("vocab_cards").get();
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const learningLanguageWord = data.learningLanguageWord;
    const englishWord = data.englishWord;
    const learningHasHtml = typeof learningLanguageWord === "string" && hasHtml(learningLanguageWord);
    const englishHasHtml = typeof englishWord === "string" && hasHtml(englishWord);
    if (!learningHasHtml && !englishHasHtml) continue;

    const updates: Record<string, string> = {};
    if (typeof learningLanguageWord === "string") updates.learningLanguageWord = stripHtml(learningLanguageWord);
    if (typeof englishWord === "string") updates.englishWord = stripHtml(englishWord);

    console.log(`vocab_cards/${doc.id}`);
    console.log(`  learningLanguageWord: ${learningLanguageWord} -> ${updates.learningLanguageWord}`);
    console.log(`  englishWord: ${englishWord} -> ${updates.englishWord}`);

    batch.update(doc.ref, updates);
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log(`vocab_cards: updated ${updated}`);
  return updated;
}

async function applyVocabLists(): Promise<number> {
  const snap = await db.collection("vocab_lists").get();
  let updated = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const words = doc.data().words;
    if (!Array.isArray(words)) continue;

    let changed = false;
    const cleanedWords = words.map((word: unknown) => {
      if (!word || typeof word !== "object") return word;
      const pair = word as {learningLanguageWord?: string; englishWord?: string};
      const learningHasHtml = typeof pair.learningLanguageWord === "string" && hasHtml(pair.learningLanguageWord);
      const englishHasHtml = typeof pair.englishWord === "string" && hasHtml(pair.englishWord);
      if (!learningHasHtml && !englishHasHtml) return pair;

      changed = true;
      return {
        ...pair,
        ...(typeof pair.learningLanguageWord === "string" ? {learningLanguageWord: stripHtml(pair.learningLanguageWord)} : {}),
        ...(typeof pair.englishWord === "string" ? {englishWord: stripHtml(pair.englishWord)} : {}),
      };
    });

    if (!changed) continue;

    batch.update(doc.ref, {words: cleanedWords, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
    batchCount++;
    updated++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();
  console.log(`vocab_lists: updated ${updated}`);
  return updated;
}

async function main(): Promise<void> {
  if (APPLY) {
    console.log("Applying fixes to Firestore...\n");
    const cardsUpdated = await applyVocabCards();
    const listsUpdated = await applyVocabLists();
    console.log(`\nDone. Updated ${cardsUpdated + listsUpdated} document(s).`);
    return;
  }

  await scanVocabCards();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
