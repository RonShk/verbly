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
          "Teaching topic only, e.g. 'Preposition choice', 'Verb tense', 'Agreement', 'Collocation', 'Register'. Never meta labels like 'Exercise requirement'.",
        detail:
          "Teach something reusable: a grammar rule, why one Spanish word fits this English meaning better than another, collocations, or nuance vs a synonym. Never say the learner erred because a word was assigned, required, in the prompt, or part of the lesson—do not mention the exercise mechanics.",
      },
    },
    /** Descriptions for the question generation schema (generateProductionQuestions). */
    generate: {
      sentenceInNativeLanguage:
        "One English sentence that continues the same mini-story as the other sentences in order; avoid unrelated ideas in the same sentence.",
      vocabWordsUsed:
        "Spanish expressions from the session vocabulary list that a natural correct translation should include (often 1–3; fewer is fine). Each Spanish expression at most once across all sentences.",
    },
  },

  /** Pedagogy rules appended to every evaluation request (production). */
  evaluatePedagogyBlock:
    "\n\nPEDAGOGY AND TONE (required):\n" +
    "- Teach Spanish like a tutor: grammar (conjugation, gender, agreement, mood), collocations, register, and why one wording fits the English meaning better than another.\n" +
    "- The Spanish expressions listed for this item are practice targets—not a checklist to penalize. If the student's Spanish conveys the English accurately and sounds natural but uses a different reasonable choice, score generously and explain nuance (when both work, say so).\n" +
    "- If you note vocabulary: explain usage in context (e.g. typical pairs, stronger vs weaker synonym), never that the learner failed because a word was assigned, required, requested, or from the prompt.\n" +
    "- Forbidden phrases in explanations and feedback include variations of: required by the exercise, you had to use, specified vocabulary, not what was asked for as vocabulary.\n" +
    "- explanations[].detail must give a reusable insight (rule, contrast, collocation)—not word-matching criticism.",

  /** High-level instruction for evaluation (no dynamic context). */
  evaluateHighLevel:
    "You are a Spanish language teacher evaluating a student's translation from English to Spanish. " +
    "Prioritize whether their Spanish conveys the English meaning accurately and sounds natural. " +
    "Then consider grammar (verb conjugation, gender agreement, word order). " +
    "Practice-target Spanish expressions help guide feedback when relevant; they are not an excuse to reject good Spanish that differs slightly but stays idiomatic and faithful. " +
    "Respond with the JSON object described by the schema.",

  /** Builds the full evaluate prompt with context. */
  buildEvaluatePrompt(
    sentenceInNativeLanguage: string,
    vocabWordsUsed: string[],
    studentAnswer: string,
    useForeignCharacters = true
  ): string {
    const foreignCharInstruction = useForeignCharacters
      ? ""
      : "\n\nIMPORTANT: The student does NOT use foreign characters / diacritics on their keyboard. " +
          "Do NOT penalize missing or incorrect Spanish diacritics (accents/ñ/ü) if the underlying letters/words are otherwise correct. " +
          "For example, treat 'como' vs 'cómo', 'senor' vs 'señor', and 'anio' vs 'año' as acceptable and do NOT mark them as wrong. " +
          "When producing correctedVersionSegments, do NOT highlight accent-only differences as 'wrong'/'correct' — mark those segments as 'none'. " +
          "Also, when useForeignCharacters is false, output Spanish WITHOUT diacritics in correctedVersion and in every correctedVersionSegments.text. " +
          "That means: no accented vowels (áéíóú), no ñ, no ü.";

    const vocabLine =
      vocabWordsUsed.length > 0
        ? `Spanish expressions emphasized for this exercise (interpret intent; strong alternatives may also be acceptable): ${vocabWordsUsed.join(", ")}`
        : "No separate vocab list for this item.";

    return (
      `${ProductionPrompts.evaluateHighLevel}\n\n` +
      `The student was asked to translate this English sentence into Spanish:\n"${sentenceInNativeLanguage}"\n\n` +
      `${vocabLine}\n\n` +
      `The student wrote: "${studentAnswer}"` +
      foreignCharInstruction +
      ProductionPrompts.evaluatePedagogyBlock
    );
  },

  /**
   * Full user prompt for structured generation: connected mini-story in English,
   * flexible use of session vocabulary, natural Spanish implied by each line.
   */
  buildGeneratePrompt(wordPairs: string, count: number): string {
    const n = String(count);
    return [
      "You are a Spanish language teacher creating production (writing) practice.",
      "The student will translate each English line into Spanish.",
      "You write only the English lines; design each line so a natural Spanish translation can include the target expressions you list in vocabWordsUsed.",
      "Beyond those targets, the student's Spanish may use normal articles, pronouns, prepositions, conjunctions, and other common function words—translations must sound natural to native speakers.",
      "",
      "Hard rules:",
      "",
      `1. Output exactly ${n} English sentences in order. Together they must read as one continuous mini-story: same setting/characters unless you explain a change (time skip, new location) in its own sentence first.`,
      "",
      "2. Coverage (flexible): You are given Spanish–English vocabulary below. Use as many items as you can while keeping the story smooth.",
      "You do NOT need to use every expression. If forcing an expression would require a weird topic jump, nonsense detail, or unnatural English, skip that expression rather than breaking the story.",
      "Prefer fewer well-connected sentences over cramming every phrase.",
      "",
      "3. No \"two unrelated ideas in one sentence\": Each sentence should have one clear situation or beat.",
      "Do not combine unrelated events in the same sentence with \"but,\" \"and,\" or commas just to pack vocabulary (for example, do not jump from dinner food to missing toilet paper in one sentence unless the restroom issue was already introduced or you clearly set up why it belongs there).",
      "",
      "4. Plant before you pivot: If you introduce a new concrete thing (centerpiece, artist, frog, napkin holder, restroom, ex-partner, dough), mention or imply it one sentence earlier when possible, or open the sentence with setup so the reader is not blindsided.",
      "",
      "5. Cause → effect: When you add conflict or humor, show why it matters to characters we already know. Avoid random one-off absurdity unless you established that tone from the start.",
      "",
      "6. Spanish naturalness: For each English sentence, imagine the Spanish a native speaker would say. If the English would force unnatural Spanish, rewrite the English.",
      "",
      "7. English quality: Clear, idiomatic, engaging—not textbook gibberish.",
      "",
      "8. Translation alignment: The English line must match the intended meaning for the Spanish you are targeting (same facts, same tone).",
      "Optional expressions (use when they fit the story; none are mandatory):",
      wordPairs,
      "",
      "Self-check before you answer:",
      `- Exactly ${n} sentences.`,
      "- Reading in order: each sentence follows naturally from the previous; no sudden new subplot mid-sentence.",
      "- No sentence stacks two unrelated scenes just to use vocabulary.",
      "- vocabWordsUsed: only phrases taken from the Spanish expressions in the list above; do not repeat the same Spanish expression in two different sentences.",
      "- If you did not use every expression, that is acceptable—coherence comes first.",
    ].join("\n");
  },
} as const;
