import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {ThinkingLevel} from "@google/genai";
import {z} from "zod";
import {generateStructured} from "../../ai/geminiClient";
import {mergeQuestionEvaluation} from "./persistEvaluatedQuestion";
import {getModeConfig} from "./sessionModes";

const db = admin.firestore();

const SKIP_SENTINEL = "(skipped)";

/**
 * Phase 2 of answer evaluation, shared by Translation and Production.
 *
 * Generates the teaching explanations for an already-graded question and merges
 * them into the question's `aiEvaluation` (setting `explanationStatus: "ready"`).
 * The client fires this without awaiting after phase 1 returns, and listens to
 * the question set doc so the explanation section fills in live.
 *
 * Idempotent: if explanations are already `ready`, returns immediately. On
 * failure, sets `explanationStatus: "failed"` so the client can offer a retry.
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

  const assignmentRef = db.collection("user_todo_assignments").doc(assignmentId);
  const assignmentSnap = await assignmentRef.get();
  if (!assignmentSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Assignment not found.");
  }
  const assignment = assignmentSnap.data()!;
  if ((assignment.userId as string) !== userId) {
    throw new functions.https.HttpsError("permission-denied", "Assignment does not belong to this user.");
  }

  const config = getModeConfig(assignment.type as string);

  const questionSetId = assignment.questionSetId as string;
  const questionSetRef = db.collection(config.questionSetCollection).doc(questionSetId);
  const questionSetSnap = await questionSetRef.get();
  if (!questionSetSnap.exists) {
    throw new functions.https.HttpsError("not-found", "Question set not found.");
  }

  const questions = questionSetSnap.data()!.questions as Array<Record<string, unknown>>;
  const question = questions[questionIndex];
  if (!question) {
    throw new functions.https.HttpsError("not-found", `Question at index ${questionIndex} not found.`);
  }

  const evaluation = (question.aiEvaluation as Record<string, unknown> | undefined) ?? {};
  const correctedVersion = evaluation.correctedVersion as string | undefined;
  if (!correctedVersion) {
    throw new functions.https.HttpsError("failed-precondition", "Phase 1 evaluation has not run for this question yet.");
  }

  // Idempotent: explanations already produced.
  if (evaluation.explanationStatus === "ready" && Array.isArray(evaluation.explanations) && evaluation.explanations.length > 0) {
    return {status: "ready"};
  }

  const studentAnswer = (question.studentAnswer as string | undefined) ?? "";
  const isSkipped = studentAnswer.trim() === SKIP_SENTINEL;
  const score = isSkipped ? null : (evaluation.score as number | undefined) ?? null;
  const sentence = question[config.sentenceField] as string;
  const vocabWordsUsed = (question.vocabWordsUsed as string[]) ?? [];

  // Flip back to generating (covers a retry from a previous "failed").
  await mergeQuestionEvaluation(questionSetRef, questionIndex, {explanationStatus: "generating"});

  const descriptions = config.evaluateDescriptions;
  const ExplanationSchema = z.object({
    explanations: z.array(
      z.object({
        category: z.string().describe(descriptions.explanation.category),
        detail: z.string().describe(descriptions.explanation.detail),
      })
    ),
  });

  try {
    const prompt = config.buildExplainPrompt(sentence, vocabWordsUsed, studentAnswer, correctedVersion, score, useForeignCharacters);
    const result = await generateStructured(prompt, ExplanationSchema, ThinkingLevel.MINIMAL);
    await mergeQuestionEvaluation(questionSetRef, questionIndex, {
      explanations: result.explanations,
      explanationStatus: "ready",
    });
    return {status: "ready"};
  } catch (err) {
    await mergeQuestionEvaluation(questionSetRef, questionIndex, {explanationStatus: "failed"}).catch(() => undefined);
    functions.logger.error("generateSentencePracticeExplanation failed", {assignmentId, questionIndex, error: String(err)});
    throw new functions.https.HttpsError("internal", "Failed to generate explanation.");
  }
});
