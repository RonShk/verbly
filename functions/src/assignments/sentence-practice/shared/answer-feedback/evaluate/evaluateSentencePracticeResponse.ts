import * as functions from "firebase-functions/v1";
import {ThinkingLevel} from "@google/genai";
import {z} from "zod";
import {generateStructured} from "../../../../../ai/geminiClient";
import {updateAssignmentProgress} from "./assignmentProgress";
import {persistEvaluatedQuestion} from "./persistEvaluatedQuestion";
import {getModeConfig} from "../../core/sessionModes";
import {assignmentDocRef, questionDocRef} from "../../core/assignmentRefs";

const SKIP_SENTINEL = "(skipped)";

/**
 * Phase 1 of answer evaluation, shared by Translation and Production.
 *
 * Returns the fast, gating part of feedback — score (omitted for skips) and the
 * corrected translation with highlight segments — then persists it onto the
 * question with `explanationStatus: "generating"`. The richer teaching
 * explanations are produced separately by `generateSentencePracticeExplanation`
 * (phase 2), which the client fires without blocking.
 *
 * Runs Gemini at MINIMAL thinking: grading a short answer does not need deep
 * reasoning, and lower thinking returns much sooner.
 */
export const evaluateSentencePracticeResponse = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const userId = context.auth.uid;
  const assignmentId = data?.assignmentId;
  const questionIndex = data?.questionIndex;
  const studentAnswer = data?.studentAnswer;
  const useForeignCharacters = typeof data?.useForeignCharacters === "boolean" ? data.useForeignCharacters : true;

  if (!assignmentId || typeof assignmentId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "assignmentId is required.");
  }
  if (typeof questionIndex !== "number" || questionIndex < 0) {
    throw new functions.https.HttpsError("invalid-argument", "questionIndex must be a non-negative number.");
  }
  if (!studentAnswer || typeof studentAnswer !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "studentAnswer is required.");
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

  const totalQuestionCount = (assignment.totalQuestionCount as number) ?? 0;
  let completedQuestionCount = (assignment.completedQuestionCount as number) ?? 0;
  completedQuestionCount = Math.min(completedQuestionCount + 1, totalQuestionCount);

  const isSkipped = studentAnswer.trim() === SKIP_SENTINEL;
  const sentence = question[config.sentenceField] as string;
  const vocabWordsUsed = (question.vocabWordsUsed as string[]) ?? [];

  const descriptions = config.evaluateDescriptions;
  const SegmentSchema = z.object({
    text: z.string().describe(descriptions.segment.text),
    highlight: z.enum(["none", "wrong", "correct"]).describe(descriptions.segment.highlight),
  });

  let score: number | null;
  let correctedVersion: string;
  let correctedVersionSegments: Array<{text: string; highlight: string}>;

  if (isSkipped) {
    const SkipSchema = z.object({
      correctedVersion: z.string().describe(descriptions.correctedVersion),
      correctedVersionSegments: z.array(SegmentSchema).optional().describe(descriptions.correctedVersionSegments),
    });
    const prompt = config.buildEvaluateSkipPhase1Prompt(sentence, vocabWordsUsed, useForeignCharacters);
    const evaluation = await generateStructured(prompt, SkipSchema, ThinkingLevel.MINIMAL);
    score = null;
    correctedVersion = evaluation.correctedVersion;
    correctedVersionSegments = evaluation.correctedVersionSegments ?? [];
  } else {
    const Phase1Schema = z.object({
      score: z.number().min(0).max(100).describe(descriptions.score),
      correctedVersion: z.string().describe(descriptions.correctedVersion),
      correctedVersionSegments: z.array(SegmentSchema).optional().describe(descriptions.correctedVersionSegments),
    });
    const prompt = config.buildEvaluatePhase1Prompt(sentence, vocabWordsUsed, studentAnswer, useForeignCharacters);
    const evaluation = await generateStructured(prompt, Phase1Schema, ThinkingLevel.MINIMAL);
    score = evaluation.score;
    correctedVersion = evaluation.correctedVersion;
    correctedVersionSegments = evaluation.correctedVersionSegments ?? [];
  }

  const persistedAnswer = isSkipped ? SKIP_SENTINEL : studentAnswer;
  await persistEvaluatedQuestion(assignmentRef, questionIndex, persistedAnswer, {
    score,
    correctedVersion,
    correctedVersionSegments,
    explanations: [],
    explanationStatus: "generating",
  });

  const {assignmentCompleted} = await updateAssignmentProgress(assignmentRef, totalQuestionCount, completedQuestionCount);

  return {
    score: score ?? 0,
    correctedVersion,
    correctedVersionSegments,
    completedQuestionCount,
    totalQuestionCount,
    assignmentCompleted,
    skipped: isSkipped,
  };
});
