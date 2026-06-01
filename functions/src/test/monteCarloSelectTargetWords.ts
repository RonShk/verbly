/**
 * Monte Carlo overlap test for selectTargetWordsForSession.
 *
 * Simulates N independent session word picks (same user, same Firestore state)
 * to measure how often the same vocab keys reappear — useful before adding
 * cross-session exclusion.
 *
 * Run from functions/:
 *   npm run test:monte-carlo-words -- YOUR_USER_ID
 *   npm run test:monte-carlo-words -- YOUR_USER_ID --runs 7
 *   npm run test:monte-carlo-words -- YOUR_USER_ID --runs 7 --trials 20
 *   npm run test:monte-carlo-words -- YOUR_USER_ID --runs 7 --max-words 30
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import {selectTargetWordsForSession, wordKey, type TargetWord} from "../utils/selectTargetWordsForSession";
import {ensureFirebaseApp} from "./firebaseInit";

ensureFirebaseApp();

interface CliOptions {
  userId: string;
  runs: number;
  trials: number;
  maxWords: number;
}

function parseArgs(argv: string[]): CliOptions {
  const positional: string[] = [];
  let runs = 7;
  let trials = 1;
  let maxWords = 30;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--runs" && argv[i + 1]) {
      runs = Math.max(1, parseInt(argv[++i], 10) || runs);
    } else if (arg === "--trials" && argv[i + 1]) {
      trials = Math.max(1, parseInt(argv[++i], 10) || trials);
    } else if (arg === "--max-words" && argv[i + 1]) {
      maxWords = Math.max(1, parseInt(argv[++i], 10) || maxWords);
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  const userId = positional[0];
  if (!userId) {
    console.error(
      "Usage: npm run test:monte-carlo-words -- <userId> [--runs 7] [--trials 1] [--max-words 30]"
    );
    process.exit(1);
  }

  return {userId, runs, trials, maxWords};
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const k of a) {
    if (b.has(k)) n++;
  }
  return n;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

async function runTrial(userId: string, runs: number, maxWords: number): Promise<{
  runKeys: Set<string>[];
  pairwiseVsFirst: number[];
  unionSize: number;
  freq: Map<string, number>;
}> {
  const runKeys: Set<string>[] = [];

  for (let r = 0; r < runs; r++) {
    const words = await selectTargetWordsForSession(userId, {maxWords});
    runKeys.push(new Set(words.map(wordKey)));
  }

  const pairwiseVsFirst: number[] = [];
  for (let i = 1; i < runKeys.length; i++) {
    pairwiseVsFirst.push(overlapCount(runKeys[0], runKeys[i]));
  }

  const union = new Set<string>();
  const freq = new Map<string, number>();
  for (const set of runKeys) {
    for (const k of set) {
      union.add(k);
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
  }

  return {runKeys, pairwiseVsFirst, unionSize: union.size, freq};
}

function printWordSample(words: TargetWord[], max = 8): string {
  const slice = words.slice(0, max).map((w) => w.learningLanguageWord);
  const suffix = words.length > max ? `, +${words.length - max} more` : "";
  return slice.join(", ") + suffix;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  console.log("Monte Carlo: selectTargetWordsForSession overlap");
  console.log(`  userId:    ${opts.userId}`);
  console.log(`  runs:      ${opts.runs} simulated sessions per trial`);
  console.log(`  trials:    ${opts.trials}`);
  console.log(`  maxWords:  ${opts.maxWords} (matches generateSessionQuestions)`);
  console.log("  note: Firestore state is unchanged between runs (upper bound on repetition)\n");

  const allPairwisePct: number[] = [];
  const allUnionPct: number[] = [];
  const globalFreq = new Map<string, number>();

  for (let t = 0; t < opts.trials; t++) {
    const {runKeys, pairwiseVsFirst, unionSize, freq} = await runTrial(
      opts.userId,
      opts.runs,
      opts.maxWords
    );

    const sizes = runKeys.map((s) => s.size);
    const minSize = Math.min(...sizes, opts.maxWords);

    for (const pct of pairwiseVsFirst) {
      allPairwisePct.push(minSize > 0 ? (pct / minSize) * 100 : 0);
    }

    const unionPct = minSize > 0 ? (unionSize / (opts.runs * minSize)) * 100 : 0;
    allUnionPct.push(unionPct);

    for (const [k, c] of freq) {
      globalFreq.set(k, (globalFreq.get(k) ?? 0) + c);
    }

    if (opts.trials === 1) {
      console.log("Per-run sizes:", sizes.join(", "));
      console.log("\nOverlap vs run 1 (count / min run size):");
      for (let i = 0; i < pairwiseVsFirst.length; i++) {
        const pct = minSize > 0 ? ((pairwiseVsFirst[i] / minSize) * 100).toFixed(1) : "0";
        console.log(`  run 1 vs run ${i + 2}: ${pairwiseVsFirst[i]}/${minSize} (${pct}%)`);
      }
      console.log(`\nDistinct words across all ${opts.runs} runs: ${unionSize}`);
      console.log(`  union / (runs × words): ${unionPct.toFixed(1)}% of slots are unique keys`);

      const sticky = [...freq.entries()]
        .filter(([, c]) => c >= Math.ceil(opts.runs / 2))
        .sort((a, b) => b[1] - a[1]);
      console.log(`\nWords in ≥ ${Math.ceil(opts.runs / 2)} of ${opts.runs} runs (${sticky.length}):`);
      for (const [key, count] of sticky.slice(0, 25)) {
        console.log(`  ${count}/${opts.runs}  ${key}`);
      }
      if (sticky.length > 25) {
        console.log(`  … and ${sticky.length - 25} more`);
      }
    } else {
      const avgPair = mean(pairwiseVsFirst.map((n) => (minSize > 0 ? (n / minSize) * 100 : 0)));
      console.log(`Trial ${t + 1}/${opts.trials}: avg overlap vs run1 ${avgPair.toFixed(1)}%, union fill ${unionPct.toFixed(1)}%`);
    }
  }

  if (opts.trials > 1) {
    console.log("\n--- Aggregated over trials ---");
    console.log(`  Mean overlap vs run 1: ${mean(allPairwisePct).toFixed(1)}%`);
    console.log(`  Mean union fill:       ${mean(allUnionPct).toFixed(1)}%`);
  }

  const totalRuns = opts.runs * opts.trials;
  const stickyGlobal = [...globalFreq.entries()]
    .filter(([, c]) => c >= Math.ceil(totalRuns * 0.5))
    .sort((a, b) => b[1] - a[1]);
  console.log(`\nSticky across all ${totalRuns} picks (≥50% appearance, top 20):`);
  for (const [key, count] of stickyGlobal.slice(0, 20)) {
    console.log(`  ${count}/${totalRuns}  ${key}`);
  }

  // One sample run for human inspection
  const sample = await selectTargetWordsForSession(opts.userId, {maxWords: opts.maxWords});
  if (sample.length > 0) {
    console.log(`\nSample selection (${sample.length} words): ${printWordSample(sample)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
