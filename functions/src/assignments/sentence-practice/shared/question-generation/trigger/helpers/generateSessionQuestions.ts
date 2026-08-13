import * as admin from "firebase-admin";
import {FieldValue, type DocumentReference} from "firebase-admin/firestore";
import {z} from "zod";
import {NO_VOCAB_STATUS} from "../../../core/generationStatus";
import {generateStructuredStream} from "../../../../../../ai/geminiClient";
import {selectTargetWordsForSession} from "./selectTargetWordsForSession";
import {normalizeWord} from "./recentSentencePracticeWords";
import {StreamingJsonArrayExtractor} from "../../../core/streamingJsonArray";
import {type SessionModeConfig} from "../../../core/sessionModes";
import {QUESTIONS_SUBCOLLECTION} from "../../../core/assignmentRefs";

/**
 * Streams AI-generated questions into an assignment's `questions` subcollection,
 * writing each question as its own doc (id = its index) as soon as it is parsed
 * from the model stream. Single shared implementation for both Translation and
 * Production — the mode config supplies the only differences (sentence field,
 * prompt text).
 *
 * Generation lifecycle lives on the parent assignment doc: it ends with
 * `generationStatus: "ready"` (plus a denormalized `vocabWordKeysUsed` summary
 * used to keep consecutive sessions fresh) or `"failed"` with a
 * `generationError` message so the client can surface a retry.
 */
export async function streamGenerateSessionQuestions(config: SessionModeConfig, userId: string, assignmentRef: DocumentReference, timezoneOffsetMinutes = 0): Promise<{generatedCount: number}> {
  // A neutral schema (`sentence`) shared by both modes; we map it to the
  // mode-specific field name when persisting so existing clients keep working.
  const QuestionItemSchema = z.object({
    sentence: z.string().describe(config.sentenceDescription),
    vocabWordsUsed: z.array(z.string()).describe(config.vocabWordsUsedDescription),
  });
  const ResponseSchema = z.object({questions: z.array(QuestionItemSchema)});
  const questionsRef = assignmentRef.collection(QUESTIONS_SUBCOLLECTION);

  try {
    // Clear any partial questions from a prior failed run before regenerating.
    await clearQuestions(questionsRef);

    const words = await selectTargetWordsForSession(userId, {maxWords: 30, timezoneOffsetMinutes});
    if (words.length === 0) {
      // Terminal, not a failure: the student has no words to practise. "failed"
      // would invite endless retries (enqueue re-triggers failed generations)
      // that can only fail the same way.
      await assignmentRef.update({generationStatus: NO_VOCAB_STATUS, generationError: FieldValue.delete()});
      return {generatedCount: 0};
    }

    const wordPairs = words.map((w) => `${w.learningLanguageWord} (${w.englishWord})`).join(", ");
    const prompt = config.buildGeneratePrompt(wordPairs, config.questionCount);

    const extractor = new StreamingJsonArrayExtractor("questions");
    const usedWordKeys = new Set<string>();
    let index = 0;

    await generateStructuredStream(prompt, ResponseSchema, async (delta) => {
      const completedElements = extractor.push(delta);
      for (const rawElement of completedElements) {
        if (index >= config.questionCount) continue;

        let parsed: z.infer<typeof QuestionItemSchema>;
        try {
          parsed = QuestionItemSchema.parse(JSON.parse(rawElement));
        } catch {
          // Skip an element we cannot parse/validate rather than failing the
          // whole session; the remaining questions can still come through.
          continue;
        }

        await questionsRef.doc(String(index)).set({
          userId,
          index,
          [config.sentenceField]: parsed.sentence,
          vocabWordsUsed: parsed.vocabWordsUsed,
          studentAnswer: null,
          aiEvaluation: null,
        });
        for (const w of parsed.vocabWordsUsed) {
          if (typeof w === "string" && w.trim().length > 0) usedWordKeys.add(normalizeWord(w));
        }
        index++;
      }
    });

    if (index === 0) {
      await assignmentRef.update({generationStatus: "failed", generationError: "Generation produced no questions."});
      return {generatedCount: 0};
    }

    await assignmentRef.update({generationStatus: "ready", vocabWordKeysUsed: [...usedWordKeys]});
    return {generatedCount: index};
  } catch (err) {
    await assignmentRef.update({generationStatus: "failed", generationError: String(err)}).catch(() => undefined);
    throw err;
  }
}

/** Deletes all docs in a questions subcollection (idempotent; for retries). */
async function clearQuestions(questionsRef: admin.firestore.CollectionReference): Promise<void> {
  const snap = await questionsRef.get();
  if (snap.empty) return;
  const batch = questionsRef.firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
}
