import * as admin from "firebase-admin";
import {type DocumentReference} from "firebase-admin/firestore";
import {questionDocRef} from "../../core/assignmentRefs";

/**
 * Records a student's answer + AI evaluation onto a single question doc, and
 * updates the parent assignment's running `averageScorePercent` in the same
 * transaction.
 *
 * The average is maintained from `scoreSum` / `scoredQuestionCount` aggregates
 * on the parent so overview/list reads never have to scan every question. Only
 * numeric scores count (skips have a null score). Re-grading a question swaps
 * its previous score contribution for the new one.
 */
export async function persistEvaluatedQuestion(assignmentRef: DocumentReference, questionIndex: number, studentAnswer: string, evaluation: {score: number | null; [k: string]: unknown}): Promise<void> {
  const qRef = questionDocRef(assignmentRef, questionIndex);
  await admin.firestore().runTransaction(async (tx) => {
    const [qSnap, aSnap] = await Promise.all([tx.get(qRef), tx.get(assignmentRef)]);
    if (!qSnap.exists) return;

    const prevEval = qSnap.data()?.aiEvaluation as {score?: unknown} | null | undefined;
    const prevScore = typeof prevEval?.score === "number" ? prevEval.score : null;
    const newScore = typeof evaluation.score === "number" ? evaluation.score : null;

    let scoreSum = (aSnap.data()?.scoreSum as number | undefined) ?? 0;
    let scoredQuestionCount = (aSnap.data()?.scoredQuestionCount as number | undefined) ?? 0;
    if (prevScore !== null) {
      scoreSum -= prevScore;
      scoredQuestionCount -= 1;
    }
    if (newScore !== null) {
      scoreSum += newScore;
      scoredQuestionCount += 1;
    }
    const averageScorePercent = scoredQuestionCount > 0 ? Math.round(scoreSum / scoredQuestionCount) : null;

    tx.set(qRef, {studentAnswer, aiEvaluation: evaluation}, {merge: true});
    tx.update(assignmentRef, {scoreSum, scoredQuestionCount, averageScorePercent});
  });
}
