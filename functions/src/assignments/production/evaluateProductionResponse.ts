import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {z} from "zod";
import {generateStructured} from "../../ai/geminiClient";
import {updateAssignmentProgress} from "../../utils/assignmentProgress";
import {ProductionPrompts} from "./prompts";

const db = admin.firestore();

const evaluationSchemaDescriptions = ProductionPrompts.descriptions.evaluate;

const CorrectedSegmentSchema = z.object({
  text: z.string().describe(evaluationSchemaDescriptions.segment.text),
  highlight: z
    .enum(["none", "wrong", "correct"])
    .describe(evaluationSchemaDescriptions.segment.highlight),
});

const EvaluationSchema = z.object({
  score: z.number().min(0).max(100).describe(evaluationSchemaDescriptions.score),
  feedback: z.string().describe(evaluationSchemaDescriptions.feedback),
  correctedVersion: z.string().describe(evaluationSchemaDescriptions.correctedVersion),
  correctedVersionSegments: z.array(CorrectedSegmentSchema).optional().describe(evaluationSchemaDescriptions.correctedVersionSegments),
  explanations: z.array(
    z.object({
      category: z.string().describe(evaluationSchemaDescriptions.explanation.category),
      detail: z.string().describe(evaluationSchemaDescriptions.explanation.detail),
    })
  ),
});

export const evaluateProductionResponse = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    }
    const userId = context.auth.uid;
    const assignmentId = data?.assignmentId;
    const questionIndex = data?.questionIndex;
    const studentAnswer = data?.studentAnswer;
    const useForeignCharacters = data?.useForeignCharacters;

    if (!assignmentId || typeof assignmentId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "assignmentId is required."
      );
    }

    if (typeof questionIndex !== "number" || questionIndex < 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "questionIndex must be a non-negative number."
      );
    }

    if (!studentAnswer || typeof studentAnswer !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "studentAnswer is required."
      );
    }

    const useForeignCharactersBool = typeof useForeignCharacters === "boolean" ? useForeignCharacters : true;

    const assignmentRef = db.collection("user_todo_assignments").doc(assignmentId);
    const assignmentSnap = await assignmentRef.get();

    if (!assignmentSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Assignment not found."
      );
    }

    const assignment = assignmentSnap.data()!;
    if ((assignment.userId as string) !== userId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Assignment does not belong to this user."
      );
    }

    const questionSetId = assignment.questionSetId as string;
    const questionSetRef = db.collection("production_question_sets").doc(questionSetId);
    const questionSetSnap = await questionSetRef.get();

    if (!questionSetSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Question set not found."
      );
    }

    const questionSet = questionSetSnap.data()!;
    const questions = questionSet.questions as Array<Record<string, unknown>>;
    const question = questions[questionIndex];

    if (!question) {
      throw new functions.https.HttpsError(
        "not-found",
        `Question at index ${questionIndex} not found.`
      );
    }

    const totalQuestionCount = (assignment.totalQuestionCount as number) ?? 0;
    let completedQuestionCount = (assignment.completedQuestionCount as number) ?? 0;
    completedQuestionCount = Math.min(completedQuestionCount + 1, totalQuestionCount);

    const isSkipped = studentAnswer.trim() === "(skipped)";

    if (isSkipped) {
      // Still generate "teaching" feedback so the user sees the correct answer,
      // but the client will hide the score UI when `skipped=true`.
      const sentenceInNativeLanguage = question.sentenceInNativeLanguage as string;
      const vocabWordsUsed = question.vocabWordsUsed as string[];

      const prompt =
        ProductionPrompts.buildEvaluatePrompt(
        sentenceInNativeLanguage,
        vocabWordsUsed,
        "(skipped) — the student chose to skip. Provide the correct Spanish translation and brief teaching feedback.",
        useForeignCharactersBool
      ) +
        "\n\nIMPORTANT OUTPUT REQUIREMENTS:\n" +
        "- Write ALL feedback and explanations in English.\n" +
        "- feedback: 1 short sentence explaining what the corrected Spanish means in English.\n" +
        "- explanations: a few teaching-focused bullets (grammar, usage, nuance)—not exercise requirements.\n" +
        "- Use English category names like 'Collocation' and 'Verb form'.";

      const evaluation = await generateStructured(prompt, EvaluationSchema);

      questions[questionIndex] = {
        ...question,
        studentAnswer: "(skipped)",
        aiEvaluation: evaluation,
      };
      await questionSetRef.update({questions});

      const {assignmentCompleted} = await updateAssignmentProgress(
        assignmentRef,
        {
          type: assignment.type as string,
          teacher: assignment.teacher as string,
          totalQuestionCount,
          assignmentDate: assignment.assignmentDate as string | undefined,
        },
        userId,
        completedQuestionCount
      );

      return {
        score: evaluation.score,
        feedback: evaluation.feedback,
        correctedVersion: evaluation.correctedVersion,
        correctedVersionSegments: evaluation.correctedVersionSegments ?? [],
        explanations: evaluation.explanations,
        completedQuestionCount,
        totalQuestionCount,
        assignmentCompleted,
        skipped: true,
      };
    }

    const sentenceInNativeLanguage = question.sentenceInNativeLanguage as string;
    const vocabWordsUsed = question.vocabWordsUsed as string[];

    const prompt = ProductionPrompts.buildEvaluatePrompt(
      sentenceInNativeLanguage,
      vocabWordsUsed,
      studentAnswer,
      useForeignCharactersBool
    );

    const evaluation = await generateStructured(prompt, EvaluationSchema);

    questions[questionIndex] = {
      ...question,
      studentAnswer,
      aiEvaluation: evaluation,
    };

    await questionSetRef.update({questions});

    const {assignmentCompleted} = await updateAssignmentProgress(
      assignmentRef,
      {
        type: assignment.type as string,
        teacher: assignment.teacher as string,
        totalQuestionCount,
        assignmentDate: assignment.assignmentDate as string | undefined,
      },
      userId,
      completedQuestionCount
    );

    return {
      score: evaluation.score,
      feedback: evaluation.feedback,
      correctedVersion: evaluation.correctedVersion,
      correctedVersionSegments: evaluation.correctedVersionSegments ?? [],
      explanations: evaluation.explanations,
      completedQuestionCount,
      totalQuestionCount,
      assignmentCompleted,
      skipped: false,
    };
  });
