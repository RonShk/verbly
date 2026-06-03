import * as functions from "firebase-functions/v1";
import {ThinkingLevel} from "@google/genai";
import {z} from "zod";
import {generateStructuredStream} from "../../../../../ai/geminiClient";
import {appendExplanationBullet, mergeQuestionEvaluation} from "./persistExplanationUpdates";
import {getModeConfig} from "../../core/sessionModes";
import {StreamingJsonArrayExtractor} from "../../core/streamingJsonArray";
import {assignmentDocRef, questionDocRef} from "../../core/assignmentRefs";

const SKIP_SENTINEL = "(skipped)";

/**
 * Phase 2 of answer evaluation, shared by Translation and Production.
 *
 * Streams teaching explanation bullets into the question's `aiEvaluation` as
 * Gemini completes each array element, then sets `explanationStatus: "ready"`.
 * The client fires this without awaiting after phase 1 returns, and listens to
 * the question set doc so bullets appear incrementally on the feedback screen.
 *
 * Idempotent: if explanations are already `ready`, returns immediately. If a
 * stream is already in progress (`generating`), returns without starting another.
 * On failure, sets `explanationStatus: "failed"` so the client can offer retry.
 */
export const generateSentencePracticeExplanation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const userId = context.auth.uid;
  const assignmentId = data?.assignmentId;
  const questionIndex = data?.questionIndex;
  const useForeignCharacters = typeof data?.useForeignCharacters === "boolean" ? data.useForeignCharacters : true;

  if (!assignmentId || typeof assignmentId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "assignmentId is required.");
  }
  if (typeof questionIndex !== "number" || questionIndex < 0) {
    throw new functions.https.HttpsError("invalid-argument", "questionIndex must be a non-negative number.");
  }

  const assignmentRef = assignmentDocRef(assignmentId);
  const assignmentSnap = await assignmentRef.get();
  if (!assignmentSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Assignment not found.");
  }
  const assignment = assignmentSnap.data()!;
  if ((assignment.userId as string) !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Assignment does not belong to this user.");
  }

  const config = getModeConfig(assignment.type as string);

  const questionSnap = await questionDocRef(assignmentRef, questionIndex).get();
  if (!questionSnap.exists) {
    throw new functions.https.HttpsError("not-found", `Question at index ${questionIndex} not found.`);
  }
  const question = questionSnap.data()!;

  const evaluation = (question.aiEvaluation as Record<string, unknown> | undefined) ?? {};
  const correctedVersion = evaluation.correctedVersion as string | undefined;
  if (!correctedVersion) {
    throw new functions.https.HttpsError("failed-precondition", "Phase 1 evaluation has not run for this question yet.");
  }

  if (evaluation.explanationStatus === "ready" && Array.isArray(evaluation.explanations) && evaluation.explanations.length > 0) {
    return {status: "ready"};
  }

  // Phase 1 leaves status "generating" with an empty list; only skip if a stream is
  // already appending bullets (e.g. duplicate unawaited invocation).
  const existingBullets = evaluation.explanations;
  if (evaluation.explanationStatus === "generating" && Array.isArray(existingBullets) && existingBullets.length > 0) {
    return {status: "generating"};
  }

  const studentAnswer = (question.studentAnswer as string | undefined) ?? "";
  const isSkipped = studentAnswer.trim() === SKIP_SENTINEL;
  const score = isSkipped ? null : (evaluation.score as number | undefined) ?? null;
  const sentence = question[config.sentenceField] as string;
  const vocabWordsUsed = (question.vocabWordsUsed as string[]) ?? [];

  await mergeQuestionEvaluation(assignmentRef, questionIndex, {explanationStatus: "generating", explanations: []});

  const descriptions = config.evaluateDescriptions;
  const ExplanationItemSchema = z.object({
    category: z.string().describe(descriptions.explanation.category),
    detail: z.string().describe(descriptions.explanation.detail),
  });
  const ExplanationSchema = z.object({
    explanations: z.array(ExplanationItemSchema),
  });

  try {
    const prompt = config.buildExplainPrompt(sentence, vocabWordsUsed, studentAnswer, correctedVersion, score, useForeignCharacters);
    const extractor = new StreamingJsonArrayExtractor("explanations");

    await generateStructuredStream(prompt, ExplanationSchema, async (delta) => {
      const completedElements = extractor.push(delta);
      for (const rawElement of completedElements) {
        try {
          const item = ExplanationItemSchema.parse(JSON.parse(rawElement));
          await appendExplanationBullet(assignmentRef, questionIndex, item);
        } catch {
          continue;
        }
      }
    }, ThinkingLevel.MINIMAL);

    await mergeQuestionEvaluation(assignmentRef, questionIndex, {explanationStatus: "ready"});
    return {status: "ready"};
  } catch (err) {
    await mergeQuestionEvaluation(assignmentRef, questionIndex, {explanationStatus: "failed"}).catch(() => undefined);
    functions.logger.error("generateSentencePracticeExplanation failed", {assignmentId, questionIndex, error: String(err)});
    throw new functions.https.HttpsError("internal", "Failed to generate explanation.");
  }
});
