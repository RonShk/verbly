import * as admin from "firebase-admin";
import {type DocumentReference} from "firebase-admin/firestore";
import {z} from "zod";
import {generateStructuredStream} from "../../ai/geminiClient";
import {selectTargetWordsForSession} from "../../utils/selectTargetWordsForSession";
import {StreamingJsonArrayExtractor} from "./streamingJsonArray";
import {type SessionModeConfig} from "./sessionModes";

const db = admin.firestore();

/**
 * Streams AI-generated questions into an existing (empty, status="generating")
 * question set document, appending each question to Firestore as soon as it is
 * parsed from the model stream. This is the single shared implementation for
 * both Translation and Production — the mode config supplies the only
 * differences (collection, sentence field, prompt text).
 *
 * On success the doc ends with status="ready"; on failure status="failed" with
 * an `error` message so the client can surface a retry.
 */
export async function streamGenerateSessionQuestions(config: SessionModeConfig, userId: string, questionSetRef: DocumentReference): Promise<{generatedCount: number}> {
  // A neutral schema (`sentence`) shared by both modes; we map it to the
  // mode-specific field name when persisting so existing clients keep working.
  const QuestionItemSchema = z.object({
    sentence: z.string().describe(config.sentenceDescription),
    vocabWordsUsed: z.array(z.string()).describe(config.vocabWordsUsedDescription),
  });
  const ResponseSchema = z.object({questions: z.array(QuestionItemSchema)});

  try {
    const words = await selectTargetWordsForSession(userId, {maxWords: 30});
    if (words.length === 0) {
      await questionSetRef.update({status: "failed", error: "No vocab words available. Add words before starting a session."});
      return {generatedCount: 0};
    }

    const wordPairs = words.map((w) => `${w.learningLanguageWord} (${w.englishWord})`).join(", ");
    const prompt = config.buildGeneratePrompt(wordPairs, config.questionCount);

    const extractor = new StreamingJsonArrayExtractor("questions");
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

        const question: Record<string, unknown> = {
          index,
          [config.sentenceField]: parsed.sentence,
          vocabWordsUsed: parsed.vocabWordsUsed,
          studentAnswer: null,
          aiEvaluation: null,
        };
        index++;

        await questionSetRef.update({
          questions: admin.firestore.FieldValue.arrayUnion(question),
          generatedCount: index,
        });
      }
    });

    if (index === 0) {
      await questionSetRef.update({status: "failed", error: "Generation produced no questions."});
      return {generatedCount: 0};
    }

    await questionSetRef.update({status: "ready", generatedCount: index});
    return {generatedCount: index};
  } catch (err) {
    await questionSetRef.update({status: "failed", error: String(err)}).catch(() => undefined);
    throw err;
  }
}

/** Updates the owning assignment's `generationStatus` to mirror the set's status. */
export async function syncAssignmentGenerationStatus(assignmentId: string, status: string): Promise<void> {
  await db.collection("user_todo_assignments").doc(assignmentId).update({generationStatus: status}).catch(() => undefined);
}
