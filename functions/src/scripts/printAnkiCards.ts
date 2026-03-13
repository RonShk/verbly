/**
 * Reads an Anki collection (collection_real.anki2), creates a vocab_list document
 * in Firestore, then creates vocab_cards linked to that list. Uses demo_user and es.
 *
 * Requires Firebase credentials (e.g. GOOGLE_APPLICATION_CREDENTIALS or
 * gcloud auth application-default login).
 *
 * Usage (from functions/):
 *   npm run anki:print-cards -- /path/to/collection_real.anki2
 *
 * Or with npx from functions/:
 *   npx ts-node --compilerOptions '{"module":"CommonJS","moduleResolution":"node"}' src/scripts/printAnkiCards.ts /path/to/collection_real.anki2
 */

import * as admin from "firebase-admin";
import Database from "better-sqlite3";
import * as path from "path";

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;

const USER_ID = "demo_user";
const LEARNING_LANGUAGE = "es";

interface CardRow {
  card_id: number;
  nid: number;
  did: number;
  ord: number;
  mod: number;
  usn: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  odue: number;
  odid: number;
  flags: number;
  data: string | null;
  note_fields: string;
  note_tags: string;
}

interface ParsedNote {
  learningLanguageWord: string;
  englishWord: string;
  row: CardRow;
  dueDate: Date;
  modDate: Date;
}

function parseAnkiNotes(dbPath: string): { parsed: ParsedNote[]; collectionCreationMs: number } {
  const resolved = path.resolve(dbPath);
  const sqlite = new Database(resolved, { readonly: true });

  const crtRow = sqlite.prepare("SELECT crt FROM col").get() as { crt: number } | undefined;
  if (!crtRow) {
    sqlite.close();
    throw new Error("No 'col' row found in Anki collection.");
  }
  const crtRaw = crtRow.crt;
  const crtDays = crtRaw > 100000 ? Math.floor(crtRaw / 86400) : crtRaw;
  const epochMs = new Date(Date.UTC(1970, 0, 1)).getTime();
  const collectionCreationMs = epochMs + crtDays * 24 * 60 * 60 * 1000;

  const sql = `
    SELECT
      c.id   AS card_id,
      c.nid,
      c.did,
      c.ord,
      c.mod,
      c.usn,
      c.type,
      c.queue,
      c.due,
      c.ivl,
      c.factor,
      c.reps,
      c.lapses,
      c.left,
      c.odue,
      c.odid,
      c.flags,
      c.data,
      n.flds AS note_fields,
      n.tags AS note_tags
    FROM cards c
    JOIN notes n ON c.nid = n.id
    ORDER BY c.id
  `;

  const rows = sqlite.prepare(sql).all() as CardRow[];

  const byNote = new Map<number, CardRow>();
  for (const row of rows) {
    const existing = byNote.get(row.nid);
    if (
      !existing ||
      row.reps > existing.reps ||
      (row.reps === existing.reps && row.due > existing.due)
    ) {
      byNote.set(row.nid, row);
    }
  }
  const onePerNote = Array.from(byNote.values());

  const parsed: ParsedNote[] = [];
  for (const row of onePerNote) {
    const fields = (row.note_fields ?? "").split("\x1f");
    const front = (fields[0] ?? "").trim();
    const back = (fields[1] ?? "").trim();
    const backVariants = back.split("/").map((s) => s.trim()).filter(Boolean);
    const learningLanguageWord = backVariants.length > 0 ? backVariants[0] : back;
    const englishWord = front;

    let dueDate: Date;
    if (row.type === 2) {
      dueDate = new Date(collectionCreationMs + row.due * 24 * 60 * 60 * 1000);
    } else {
      dueDate = new Date(collectionCreationMs + row.due * 1000);
    }
    const modDate = new Date(row.mod * 1000);
    if (Number.isNaN(dueDate.getTime())) dueDate = new Date();
    if (Number.isNaN(modDate.getTime())) modDate.setTime(Date.now());

    parsed.push({
      learningLanguageWord,
      englishWord,
      row,
      dueDate,
      modDate,
    });
  }

  sqlite.close();
  return { parsed, collectionCreationMs };
}

async function main(): Promise<void> {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error("Usage: npm run anki:print-cards -- <path/to/collection_real.anki2>");
    process.exit(1);
  }

  console.log("Reading Anki collection...");
  const { parsed } = parseAnkiNotes(dbPath);
  console.log(`Unique notes (word pairs): ${parsed.length}\n`);

  const now = Timestamp.now();
  const words = parsed.map((p) => ({
    englishWord: p.englishWord,
    learningLanguageWord: p.learningLanguageWord,
  }));

  console.log("Creating vocab_list document...");
  const vocabListRef = await db.collection("vocab_lists").add({
    userId: USER_ID,
    learningLanguage: LEARNING_LANGUAGE,
    words,
    createdAt: now,
    updatedAt: now,
  });
  const vocabListId = vocabListRef.id;
  console.log("Created vocab_list:", vocabListId, "with", words.length, "words\n");

  console.log("Creating vocab_cards...");
  let created = 0;
  for (const p of parsed) {
    const row = p.row;
    const dueTs = Timestamp.fromDate(p.dueDate);
    const lastReview = row.reps > 0 ? Timestamp.fromDate(p.modDate) : null;
    const firstLearnedAt = row.reps > 0 ? Timestamp.fromDate(p.modDate) : null;

    await db.collection("vocab_cards").add({
      userId: USER_ID,
      vocabListId,
      learningLanguageWord: p.learningLanguageWord,
      englishWord: p.englishWord,
      due: dueTs,
      stability: row.ivl,
      difficulty: row.factor / 1000,
      elapsedDays: row.ivl,
      scheduledDays: row.ivl,
      learningSteps: 0,
      reps: row.reps,
      lapses: row.lapses,
      state: row.type,
      lastReview,
      createdAt: now,
      firstLearnedAt,
      lastFailureAt: null,
      againCount: 0,
      hardTag: false,
      leechTag: false,
    });
    created++;
  }

  console.log("Done.");
  console.log("vocab_list id:", vocabListId);
  console.log("vocab_cards created:", created);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
