/**
 * Centralized prompts and Zod field descriptions for Production mode.
 * Use descriptions with schema.describe() so Gemini gets field guidance from the JSON Schema.
 */

export const ProductionPrompts = {
  /** Descriptions for the evaluation response schema (evaluateProductionResponse). */
  descriptions: {
    evaluate: {
      score:
        "A number from 0-100 representing translation quality.",
      feedback:
        "A brief encouraging message about their performance (e.g. 'Great progress!', 'Strong Effort!', 'Keep practicing!').",
      correctedVersion:
        "The full ideal Spanish translation as a single string. If the student's answer is perfect, return their answer.",
      correctedVersionSegments:
        "Array of segments that when concatenated form the correctedVersion. Each segment has 'text' and 'highlight': 'none' (default), 'wrong' (the incorrect word/phrase the student used, show in red), or 'correct' (the correction, show in green). Include segments for every part of the sentence; use 'none' for unchanged text. Example: for student 'vacuna por la enfermedad' and correct 'vacuna contra la enfermedad', use segments like [{\"text\": \"vacuna \", \"highlight\": \"none\"}, {\"text\": \"por\", \"highlight\": \"wrong\"}, {\"text\": \" \", \"highlight\": \"none\"}, {\"text\": \"contra\", \"highlight\": \"correct\"}, {\"text\": \" la enfermedad\", \"highlight\": \"none\"}].",
      segment: {
        text: "A substring of the corrected sentence.",
        highlight:
          "One of 'none' (unchanged), 'wrong' (incorrect word from student), or 'correct' (the correction).",
      },
      explanation: {
        category:
          "E.g. 'Preposition Usage', 'Verb Conjugation', 'Gender Agreement', 'Vocabulary Tip'.",
        detail:
          "A clear, concise explanation of what was done well or what to improve.",
      },
    },
    /** Descriptions for the question generation schema (generateProductionQuestions). */
    generate: {
      sentenceInNativeLanguage:
        "The English sentence the student must translate into Spanish.",
      vocabWordsUsed:
        "Array of the Spanish vocabulary words the student should use in their translation.",
    },
  },

  /** High-level instruction for evaluation (no dynamic context). */
  evaluateHighLevel:
    "You are a Spanish language teacher evaluating a student's translation from English to Spanish. " +
    "Evaluate their Spanish translation for: (1) Correct usage of the target vocabulary words, " +
    "(2) Grammar accuracy (verb conjugation, gender agreement, word order), " +
    "(3) Overall meaning accuracy. " +
    "Respond with the JSON object described by the schema.",

  /** Builds the full evaluate prompt with context. */
  buildEvaluatePrompt(
    sentenceInNativeLanguage: string,
    vocabWordsUsed: string[],
    studentAnswer: string
  ): string {
    return (
      `${ProductionPrompts.evaluateHighLevel}\n\n` +
      `The student was asked to translate this English sentence into Spanish:\n"${sentenceInNativeLanguage}"\n\n` +
      `The key Spanish vocabulary words they should use: ${vocabWordsUsed.join(", ")}\n\n` +
      `The student wrote: "${studentAnswer}"`
    );
  },

  /** High-level instruction for question generation (context injected by builder). */
  generateHighLevel:
    "You are a Spanish language teacher creating production (writing) practice. " +
    "Generate English sentences that a student must translate into Spanish. " +
    "Each sentence should require the student to use 1-3 of the given Spanish vocabulary words when translating. " +
    "Sentences should: be written in natural English; be designed so the correct Spanish translation naturally uses the target vocab words; " +
    "range from simple to moderately complex; provide real-world context (formal introductions, business, daily life, etc.). " +
    "Respond with the JSON object described by the schema.",

  /** Builds the full generate prompt with context. */
  buildGeneratePrompt(wordPairs: string, count: number): string {
    return (
      `${ProductionPrompts.generateHighLevel}\n\n` +
      `Given these Spanish-English vocabulary pairs: ${wordPairs}\n\n` +
      `Generate ${count} such sentences.`
    );
  },
} as const;
