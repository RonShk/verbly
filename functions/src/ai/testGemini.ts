/**
 * Smoke test for Gemini structured JSON responses.
 * Tests both Translation and Production question generation prompts.
 *
 * Run from functions/:
 *   npm run test:gemini
 */
import * as dotenv from "dotenv";
dotenv.config();

import {z} from "zod";
import {generateStructured} from "./geminiClient";

const translationResponseSchema = z.object({
  questions: z.array(
    z.object({
      sentenceInLearningLanguage: z
        .string()
        .describe("A natural sentence in the target language using 1-3 vocab words."),
      vocabWordsUsed: z
        .array(z.string())
        .describe("Which vocab words from the list appear in this sentence."),
    })
  ),
});

const productionResponseSchema = z.object({
  questions: z.array(
    z.object({
      sentenceInNativeLanguage: z
        .string()
        .describe("A natural English sentence that requires specific vocab words to translate."),
      vocabWordsUsed: z
        .array(z.string())
        .describe("Which vocab words the student needs to use when translating."),
    })
  ),
});

const VOCAB_WORDS = [
  {learningLanguageWord: "hola", englishWord: "hello"},
  {learningLanguageWord: "casa", englishWord: "house"},
  {learningLanguageWord: "libro", englishWord: "book"},
  {learningLanguageWord: "agua", englishWord: "water"},
  {learningLanguageWord: "amigo", englishWord: "friend"},
  {learningLanguageWord: "tiempo", englishWord: "time"},
];

async function testTranslation(): Promise<void> {
  console.log("--- Translation Mode (Target -> Native) ---\n");

  const wordList = VOCAB_WORDS.map(
    (w) => `${w.learningLanguageWord} (${w.englishWord})`
  ).join(", ");

  const result = await generateStructured(
    `You are a Spanish language teacher creating translation exercises.

    Given these vocabulary words: ${wordList}

    Generate 3 natural Spanish sentences. Each sentence should:
    - Use 1-3 of the vocabulary words listed above
    - Be appropriate for a beginner-to-intermediate student
    - Be a complete, natural-sounding sentence

    The student will translate these sentences from Spanish to English.`,
    translationResponseSchema,
  );

  for (const q of result.questions) {
    console.log(`  Sentence: ${q.sentenceInLearningLanguage}`);
    console.log(`  Vocab used: ${q.vocabWordsUsed.join(", ")}\n`);
  }
}

async function testProduction(): Promise<void> {
  console.log("--- Production Mode (Native -> Target) ---\n");

  const wordList = VOCAB_WORDS.map(
    (w) => `${w.learningLanguageWord} (${w.englishWord})`
  ).join(", ");

  const result = await generateStructured(
    `You are a Spanish language teacher creating production exercises.

    Given these vocabulary words: ${wordList}

    Generate 3 natural English sentences. Each sentence should:
    - Require the student to use 1-3 of the vocabulary words when translating to Spanish
    - Be appropriate for a beginner-to-intermediate student
    - Be a complete, natural-sounding sentence

    The student will translate these sentences from English to Spanish.`,
    productionResponseSchema,
  );

  for (const q of result.questions) {
    console.log(`  Sentence: ${q.sentenceInNativeLanguage}`);
    console.log(`  Vocab needed: ${q.vocabWordsUsed.join(", ")}\n`);
  }
}

async function main(): Promise<void> {
  await testTranslation();
  console.log("");
  await testProduction();
  console.log("\nAll tests passed.");
}

main().catch((err) => {
  console.error("Gemini test failed:", err);
  process.exit(1);
});
