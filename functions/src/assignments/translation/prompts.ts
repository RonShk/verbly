/**
 * Centralized prompts and Zod field descriptions for Translation mode.
 * Translation: student reads Spanish sentence, types English translation.
 * AI evaluates the English translation for meaning accuracy.
 */

export const TranslationPrompts = {
  /** Descriptions for the evaluation response schema (shared evaluateSentencePracticeResponse / generateSentencePracticeExplanation). */
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
          "Teaching topic only, e.g. 'False friend', 'English idiom', 'Word order', 'Register'. Never meta labels like 'Exercise requirement'.",
        detail:
          "Teach something reusable: why this English wording matches the Spanish meaning or tone, how a synonym differs in nuance, or a grammar point. Never say the learner erred because a word was assigned, required, in the prompt, or part of the lesson.",
      },
    },
    /** Descriptions for the question generation schema (generateTranslationQuestions). */
    generate: {
      sentenceInLearningLanguage:
        "One Spanish sentence that continues the same mini-story as the other sentences in order; avoid unrelated ideas in the same sentence. The student translates this into English.",
      vocabWordsUsed:
        "Spanish expressions from the session vocabulary list that actually appear in this sentence (often 1–3; fewer is fine). Each Spanish expression at most once across all sentences.",
    },
  },

  /** Pedagogy rules appended to every evaluation request (translation). */
  evaluatePedagogyBlock:
    "\n\nPEDAGOGY AND TONE (required):\n" +
    "- Teach English like a tutor: meaning, natural idiom, false friends, word order, and register—Spanish structure often maps to English differently.\n" +
    "- The Spanish expressions listed are anchors for meaning and nuance, not a mandate that the English must use one specific gloss. If the student's English preserves the Spanish meaning and sounds natural, score well; use explanations to compare synonyms only when it helps learning.\n" +
    "- Never justify feedback with assigned vocabulary, required words, or prompt instructions.\n" +
    "- Forbidden phrases in explanations and feedback include variations of: required by the exercise, you had to mirror, specified vocabulary, not what was asked for as vocabulary.\n" +
    "- explanations[].detail must give a reusable insight—not that an English word was wrong because it was not the lesson's favorite.",

  /** High-level instruction for phase-1 grading (score + corrected only). */
  evaluatePhase1HighLevel:
    "You are a Spanish teacher grading a student's translation from Spanish to English. " +
    "The student was shown a Spanish sentence and wrote an English translation. " +
    "Prioritize faithful meaning and natural English. " +
    "Grammar and word choice matter when they change meaning or sound clearly wrong; reasonable paraphrases and close synonyms are acceptable when they match the Spanish. " +
    "Return ONLY the score, the corrected English translation, and the highlighted segments. " +
    "Do NOT write any teaching explanations or feedback prose. " +
    "Respond with the JSON object described by the schema.",

  /** Builds a vocab context line shared by the evaluate prompts. */
  evaluateVocabLine(vocabWordsUsed: string[]): string {
    return vocabWordsUsed.length > 0 ? `Spanish expressions highlighted for this sentence (use them to judge intent and nuance; English equivalents may vary): ${vocabWordsUsed.join(", ")}` : "No separate vocab list for this item.";
  },

  /** Phase 1 (normal answer): score + corrected translation + segments. */
  buildEvaluatePhase1Prompt(
    sentenceInLearningLanguage: string,
    vocabWordsUsed: string[],
    studentAnswer: string
  ): string {
    return (
      `${TranslationPrompts.evaluatePhase1HighLevel}\n\n` +
      `The Spanish sentence the student was asked to translate:\n"${sentenceInLearningLanguage}"\n\n` +
      `${TranslationPrompts.evaluateVocabLine(vocabWordsUsed)}\n\n` +
      `The student's English translation: "${studentAnswer}"`
    );
  },

  /** Phase 1 (skipped): corrected translation only, no score. */
  buildEvaluateSkipPhase1Prompt(
    sentenceInLearningLanguage: string,
    vocabWordsUsed: string[]
  ): string {
    return (
      "You are a Spanish teacher. The student skipped this question, so do NOT produce a score. " +
      "Provide the correct, natural English translation of the Spanish sentence in correctedVersion. " +
      "Respond with the JSON object described by the schema.\n\n" +
      `The Spanish sentence:\n"${sentenceInLearningLanguage}"\n\n` +
      `${TranslationPrompts.evaluateVocabLine(vocabWordsUsed)}`
    );
  },

  /** Phase 2: teaching explanations only, using the phase-1 corrected version. */
  buildExplainPrompt(
    sentenceInLearningLanguage: string,
    vocabWordsUsed: string[],
    studentAnswer: string,
    correctedVersion: string,
    score: number | null
  ): string {
    const isSkipped = score === null;
    const contextLine = isSkipped ? "The student skipped this question (no answer given)." : `The student's English translation: "${studentAnswer}"\nYou already graded this ${score}/100.`;

    return (
      "You are a Spanish teacher writing short teaching explanations for a student's translation from Spanish to English.\n\n" +
      `The Spanish sentence:\n"${sentenceInLearningLanguage}"\n\n` +
      `${TranslationPrompts.evaluateVocabLine(vocabWordsUsed)}\n\n` +
      `${contextLine}\n` +
      `The correct English translation: "${correctedVersion}"\n\n` +
      "Produce a short list of teaching explanations (a few bullets) that help the student learn from this item. " +
      "Write ALL explanations in English." +
      TranslationPrompts.evaluatePedagogyBlock
    );
  },

  /**
   * Full user prompt for structured generation: connected mini-story in Spanish,
   * flexible use of session vocabulary, natural Spanish for native speakers.
   */
  buildGeneratePrompt(wordPairs: string, count: number): string {
    const n = String(count);
    return [
      "You are a Spanish teacher creating translation practice (Spanish to English).",
      "The student will read each Spanish sentence and type an English translation.",
      "You write only the Spanish lines in sentenceInLearningLanguage; list the Spanish target expressions for that line in vocabWordsUsed.",
      "Beyond those targets, use normal Spanish articles, pronouns, prepositions, conjunctions, and other common words so every sentence sounds natural to native speakers.",
      "",
      "Hard rules:",
      "",
      `1. Output exactly ${n} Spanish sentences in order. Together they must read as one continuous mini-story: same setting/characters unless you explain a change (time skip, new location) in its own sentence first.`,
      "",
      "2. Coverage (flexible): You are given Spanish–English vocabulary below. Use as many items as you can while keeping the story smooth.",
      "You do NOT need to use every expression. If forcing an expression would require a weird topic jump, nonsense detail, or unnatural Spanish, skip that expression rather than breaking the story.",
      "Prefer fewer well-connected sentences over cramming every phrase.",
      "",
      "3. No \"two unrelated ideas in one sentence\": Each sentence should have one clear situation or beat.",
      "Do not combine unrelated events in the same sentence with \"pero,\" \"y,\" or commas just to pack vocabulary (for example, do not jump from dinner food to missing toilet paper in one sentence unless the restroom issue was already introduced or you clearly set up why it belongs there).",
      "",
      "4. Plant before you pivot: If you introduce a new concrete thing (centerpiece, artist, frog, napkin holder, restroom, ex-partner, dough), mention or imply it one sentence earlier when possible, or open the sentence with setup so the reader is not blindsided.",
      "",
      "5. Cause → effect: When you add conflict or humor, show why it matters to characters we already know. Avoid random one-off absurdity unless you established that tone from the start.",
      "",
      "6. Spanish naturalness (most important): Every sentence must sound like something a native speaker would actually say in conversation or light fiction—idiomatic, clear, and coherent.",
      "",
      "7. English translation clarity: Phrase the Spanish so that a correct English translation is clear and idiomatic (not a confusing puzzle for the student).",
      "",
      "8. Meaning alignment: Each Spanish sentence should express one clear meaning that matches the vocabulary targets you list; avoid contradictions or mixed scenes.",
      "",
      "Optional expressions (use when they fit the story; none are mandatory):",
      wordPairs,
      "",
      "Self-check before you answer:",
      `- Exactly ${n} Spanish sentences.`,
      "- Reading in order: each sentence follows naturally from the previous; no sudden new subplot mid-sentence.",
      "- No sentence stacks two unrelated scenes just to use vocabulary.",
      "- vocabWordsUsed: only Spanish phrases taken from the expressions in the list above that truly appear in sentenceInLearningLanguage for that item; do not repeat the same Spanish expression in two different sentences.",
      "- If you did not use every expression, that is acceptable—coherence comes first.",
    ].join("\n");
  },
} as const;
