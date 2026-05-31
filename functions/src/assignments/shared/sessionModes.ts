import {TranslationPrompts} from "../translation/prompts";
import {ProductionPrompts} from "../production/prompts";

/** Sentence-practice session types that share the generation pipeline. */
export type SessionType = "TRANSLATION" | "PRODUCTION";

/**
 * Schema field descriptions used when grading an answer. Shared shape between
 * Translation and Production; the wording differs per mode.
 */
export interface EvaluateDescriptions {
  score: string;
  correctedVersion: string;
  correctedVersionSegments: string;
  segment: {text: string; highlight: string};
  explanation: {category: string; detail: string};
}

/**
 * Everything the shared generation pipeline needs to know about a sentence
 * practice mode. Translation and Production are otherwise identical: same
 * word selection, same streaming generation, same persistence shape. The only
 * real differences are captured here (collection, the question's sentence
 * field name, and the prompt/schema text).
 */
export interface SessionModeConfig {
  type: SessionType;
  /** Firestore collection holding the question set docs for this mode. */
  questionSetCollection: string;
  /** Field name the sentence is stored under (kept for client compatibility). */
  sentenceField: "sentenceInLearningLanguage" | "sentenceInNativeLanguage";
  /** Human-facing title returned to the client. */
  assignmentTitle: string;
  /** Number of questions to generate per session. */
  questionCount: number;
  learningLanguage: string;
  /** Schema description for the generated sentence (guides Gemini). */
  sentenceDescription: string;
  /** Schema description for the vocab-words-used field. */
  vocabWordsUsedDescription: string;
  /** Builds the generation prompt for this mode. */
  buildGeneratePrompt: (wordPairs: string, count: number) => string;
  /** Schema field descriptions used for grading (phase 1) and explaining (phase 2). */
  evaluateDescriptions: EvaluateDescriptions;
  /** Phase 1 prompt for a normal answer: score + corrected version + segments. */
  buildEvaluatePhase1Prompt: (sentence: string, vocabWordsUsed: string[], studentAnswer: string, useForeignCharacters: boolean) => string;
  /** Phase 1 prompt for a skipped question: corrected version only, no score. */
  buildEvaluateSkipPhase1Prompt: (sentence: string, vocabWordsUsed: string[], useForeignCharacters: boolean) => string;
  /** Phase 2 prompt: teaching explanations only, given the phase-1 corrected version. */
  buildExplainPrompt: (sentence: string, vocabWordsUsed: string[], studentAnswer: string, correctedVersion: string, score: number | null, useForeignCharacters: boolean) => string;
}

const QUESTION_COUNT = 10;

export const TRANSLATION_MODE: SessionModeConfig = {
  type: "TRANSLATION",
  questionSetCollection: "translation_question_sets",
  sentenceField: "sentenceInLearningLanguage",
  assignmentTitle: "Translation Mode",
  questionCount: QUESTION_COUNT,
  learningLanguage: "es",
  sentenceDescription: TranslationPrompts.descriptions.generate.sentenceInLearningLanguage,
  vocabWordsUsedDescription: TranslationPrompts.descriptions.generate.vocabWordsUsed,
  buildGeneratePrompt: (wordPairs, count) => TranslationPrompts.buildGeneratePrompt(wordPairs, count),
  evaluateDescriptions: TranslationPrompts.descriptions.evaluate,
  buildEvaluatePhase1Prompt: (sentence, vocabWordsUsed, studentAnswer) => TranslationPrompts.buildEvaluatePhase1Prompt(sentence, vocabWordsUsed, studentAnswer),
  buildEvaluateSkipPhase1Prompt: (sentence, vocabWordsUsed) => TranslationPrompts.buildEvaluateSkipPhase1Prompt(sentence, vocabWordsUsed),
  buildExplainPrompt: (sentence, vocabWordsUsed, studentAnswer, correctedVersion, score) => TranslationPrompts.buildExplainPrompt(sentence, vocabWordsUsed, studentAnswer, correctedVersion, score),
};

export const PRODUCTION_MODE: SessionModeConfig = {
  type: "PRODUCTION",
  questionSetCollection: "production_question_sets",
  sentenceField: "sentenceInNativeLanguage",
  assignmentTitle: "Production Mode",
  questionCount: QUESTION_COUNT,
  learningLanguage: "es",
  sentenceDescription: ProductionPrompts.descriptions.generate.sentenceInNativeLanguage,
  vocabWordsUsedDescription: ProductionPrompts.descriptions.generate.vocabWordsUsed,
  buildGeneratePrompt: (wordPairs, count) => ProductionPrompts.buildGeneratePrompt(wordPairs, count),
  evaluateDescriptions: ProductionPrompts.descriptions.evaluate,
  buildEvaluatePhase1Prompt: (sentence, vocabWordsUsed, studentAnswer, useForeignCharacters) => ProductionPrompts.buildEvaluatePhase1Prompt(sentence, vocabWordsUsed, studentAnswer, useForeignCharacters),
  buildEvaluateSkipPhase1Prompt: (sentence, vocabWordsUsed, useForeignCharacters) => ProductionPrompts.buildEvaluateSkipPhase1Prompt(sentence, vocabWordsUsed, useForeignCharacters),
  buildExplainPrompt: (sentence, vocabWordsUsed, studentAnswer, correctedVersion, score, useForeignCharacters) => ProductionPrompts.buildExplainPrompt(sentence, vocabWordsUsed, studentAnswer, correctedVersion, score, useForeignCharacters),
};

/** Resolves the mode config for an assignment `type`, or throws if unsupported. */
export function getModeConfig(type: string): SessionModeConfig {
  switch (type) {
  case "TRANSLATION":
    return TRANSLATION_MODE;
  case "PRODUCTION":
    return PRODUCTION_MODE;
  default:
    throw new Error(`Unsupported sentence-practice session type: ${type}`);
  }
}
