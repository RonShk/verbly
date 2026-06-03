/**
 * Benchmarks word-selection latency: vocab load vs recent-session exclusion vs full path.
 *
 * Run from functions/:
 *   npm run test:benchmark-select-words -- <userId>
 *   npm run test:benchmark-select-words -- <userId> --iterations 5
 *
 * Requires: gcloud auth application-default login
 */
import * as admin from "firebase-admin";
import {selectTargetWordsForSession} from "../assignments/sentence-practice/shared/question-generation/trigger/helpers/selectTargetWordsForSession";
import {getRecentlyUsedWordKeys} from "../assignments/sentence-practice/shared/question-generation/trigger/helpers/recentSentencePracticeWords";
import {ensureFirebaseApp} from "./firebaseInit";

ensureFirebaseApp();

const DEFAULT_USER_ID = "40orwbMb1DdMR1yJ2ryPisctQT52";

interface BenchOpts {
  userId: string;
  iterations: number;
}

function parseArgs(argv: string[]): BenchOpts {
  let iterations = 3;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--iterations" && argv[i + 1]) {
      iterations = Math.max(1, parseInt(argv[++i], 10) || iterations);
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }
  const userId = positional[0] ?? DEFAULT_USER_ID;
  return {userId, iterations};
}

async function timeRun<T>(fn: () => Promise<T>): Promise<{ms: number; value: T}> {
  const t0 = performance.now();
  const value = await fn();
  return {ms: performance.now() - t0, value};
}

function summarize(label: string, samplesMs: number[]): void {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((s, x) => s + x, 0);
  const avg = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  console.log(`  ${label.padEnd(42)} min ${min.toFixed(0)}ms  p50 ${p50.toFixed(0)}ms  avg ${avg.toFixed(0)}ms  max ${max.toFixed(0)}ms`);
}

async function main(): Promise<void> {
  const {userId, iterations} = parseArgs(process.argv.slice(2));
  const db = admin.firestore();

  console.log("Benchmark: selectTargetWordsForSession");
  console.log(`  userId:      ${userId}`);
  console.log(`  iterations:  ${iterations} per scenario\n`);

  const vocabOnly: number[] = [];
  const recent8: number[] = [];
  const recent2: number[] = [];
  const fullWithRecent: number[] = [];
  const fullNoRecent: number[] = [];

  let cardCount = 0;
  let recent8Count = 0;

  for (let i = 0; i < iterations; i++) {
    const v = await timeRun(async () => {
      const snap = await db.collection("vocab_cards").where("userId", "==", userId).get();
      cardCount = snap.size;
    });
    vocabOnly.push(v.ms);

    const r8 = await timeRun(() => getRecentlyUsedWordKeys(userId, 8));
    recent8.push(r8.ms);
    if (i === 0) recent8Count = r8.value.size;

    const r2 = await timeRun(() => getRecentlyUsedWordKeys(userId, 2));
    recent2.push(r2.ms);

    const full = await timeRun(() => selectTargetWordsForSession(userId, {maxWords: 30, recentQuestionSetsPerCollection: 8}));
    fullWithRecent.push(full.ms);

    const fullSkip = await timeRun(() => selectTargetWordsForSession(userId, {maxWords: 30, skipRecentQuestionSetExclusion: true}));
    fullNoRecent.push(fullSkip.ms);
  }

  console.log("Firestore reads (isolated):");
  summarize(`vocab_cards where userId (n=${cardCount})`, vocabOnly);
  summarize("recent question sets (limit 8 / mode)", recent8);
  summarize("recent question sets (limit 2 / mode)", recent2);

  console.log("\nEnd-to-end selectTargetWordsForSession:");
  summarize("full path (recent limit 8)", fullWithRecent);
  summarize("full path (skip recent exclusion)", fullNoRecent);

  const avgFull = fullWithRecent.reduce((s, x) => s + x, 0) / fullWithRecent.length;
  const avgSkip = fullNoRecent.reduce((s, x) => s + x, 0) / fullNoRecent.length;
  const avgRecent = recent8.reduce((s, x) => s + x, 0) / recent8.length;
  console.log(`\n  recent exclusion adds ~${(avgFull - avgSkip).toFixed(0)}ms vs skip (avg over ${iterations} runs)`);
  console.log(`  recent-only reads are ~${avgRecent.toFixed(0)}ms (parallel with vocab in production)`);
  console.log(`  normalized recent words (limit 8): ${recent8Count}`);
  console.log("\nNote: Generation still spends seconds in Gemini; word pick is usually <1s even for ~1500 cards.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
