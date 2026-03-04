/**
 * Centralized prompts and Zod field descriptions for Translation mode.
 * Translation: student reads Spanish sentence, types English translation.
 * AI evaluates the English translation for meaning accuracy.
 */

export const TranslationPrompts = {
  /** Descriptions for the evaluation response schema (evaluateTranslationResponse). */
  descriptions: {
    evaluate: {
      score:
        "A number from 0-100 representing how accurately the student's English translation conveys the meaning of the Spanish sentence.",
      feedback:
        "A brief encouraging message about their performance (e.g. 'Great progress!', 'Strong Effort!', 'Keep practicing!').",
      correctedVersion:
        "The full ideal English translation as a single string. If the student's answer is perfect, return their answer.",
      correctedVersionSegments:
        "Array of segments that when concatenated form the correctedVersion. Each segment has 'text' and 'highlight': 'none' (default), 'wrong' (the incorrect word/phrase the student used, show in red), or 'correct' (the correction, show in green). Include segments for every part of the sentence; use 'none' for unchanged text.",
      segment: {
        text: "A substring of the corrected sentence.",
        highlight:
          "One of 'none' (unchanged), 'wrong' (incorrect word from student), or 'correct' (the correction).",
      },
      explanation: {
        category:
          "E.g. 'Preposition Usage', 'Vocabulary', 'Word Order', 'Meaning Accuracy'.",
        detail:
          "A clear, concise explanation of what was done well or what to improve in the English translation.",
      },
    },
    /** Descriptions for the question generation schema (generateTranslationQuestions). */
    generate: {
      sentenceInLearningLanguage:
        "A natural Spanish sentence that uses 1-3 of the given vocabulary words. The student will translate this into English.",
      vocabWordsUsed:
        "Array of the Spanish vocabulary words that appear in this sentence.",
    },
  },

  /** High-level instruction for evaluation (no dynamic context). */
  evaluateHighLevel:
    "You are a Spanish teacher evaluating a student's translation from Spanish to English. " +
    "The student was shown a Spanish sentence and wrote an English translation. " +
    "Evaluate their English translation for: (1) Meaning accuracy (does the English convey the same meaning as the Spanish?), " +
    "(2) Correct use of equivalent vocabulary where the target Spanish words were used, " +
    "(3) Natural, grammatical English. " +
    "Respond with the JSON object described by the schema.",

  /** Builds the full evaluate prompt with context. */
  buildEvaluatePrompt(
    sentenceInLearningLanguage: string,
    vocabWordsUsed: string[],
    studentAnswer: string
  ): string {
    return (
      `${TranslationPrompts.evaluateHighLevel}\n\n` +
      `The Spanish sentence the student was asked to translate:\n"${sentenceInLearningLanguage}"\n\n` +
      `The key Spanish vocabulary words in that sentence: ${vocabWordsUsed.join(", ")}\n\n` +
      `The student's English translation: "${studentAnswer}"`
    );
  },

  /** High-level instruction for question generation (context injected by builder). */
  generateHighLevel:
    "You are a Spanish teacher creating translation practice (Spanish to English). " +
    "Generate Spanish sentences that a student must translate into English. " +
    "Each sentence should use 1-3 of the given Spanish vocabulary words in a natural context. " +
    "Sentences should: be written in natural Spanish; range from simple to moderately complex; " +
    "provide real-world context (formal introductions, business, daily life, etc.). " +
    "Respond with the JSON object described by the schema.",

  /** Builds the full generate prompt with context. */
  buildGeneratePrompt(wordPairs: string, count: number): string {
    return (
      `${TranslationPrompts.generateHighLevel}\n\n` +
      `Given these Spanish-English vocabulary pairs: ${wordPairs}\n\n` +
      `Generate ${count} such Spanish sentences.`
    );
  },
} as const;
