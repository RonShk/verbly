import * as functions from "firebase-functions/v1";
import {type QueryDocumentSnapshot} from "firebase-admin/firestore";
import {streamGenerateSessionQuestions, syncAssignmentGenerationStatus} from "./generateSessionQuestions";
import {TRANSLATION_MODE, PRODUCTION_MODE, type SessionModeConfig} from "./sessionModes";

const RUNTIME = {timeoutSeconds: 300, memory: "256MB" as const};

/**
 * Shared handler: when a question set doc is created with status="generating"
 * (by [enqueueSessionGeneration]), stream the AI questions into it. Docs that
 * are not in the generating state (e.g. seed scripts) are ignored.
 */
async function handleQuestionSetCreated(config: SessionModeConfig, snap: QueryDocumentSnapshot): Promise<void> {
  const data = snap.data();
  if (!data || data.status !== "generating") return;

  const userId = data.userId as string | undefined;
  const assignmentId = data.assignmentId as string | undefined;
  if (!userId) return;

  try {
    await streamGenerateSessionQuestions(config, userId, snap.ref);
  } finally {
    if (assignmentId) {
      const fresh = await snap.ref.get();
      const status = (fresh.data()?.status as string | undefined) ?? "ready";
      await syncAssignmentGenerationStatus(assignmentId, status);
    }
  }
}

export const onTranslationQuestionSetCreated = functions
  .runWith(RUNTIME)
  .firestore.document("translation_question_sets/{id}")
  .onCreate((snap) => handleQuestionSetCreated(TRANSLATION_MODE, snap));

export const onProductionQuestionSetCreated = functions
  .runWith(RUNTIME)
  .firestore.document("production_question_sets/{id}")
  .onCreate((snap) => handleQuestionSetCreated(PRODUCTION_MODE, snap));
