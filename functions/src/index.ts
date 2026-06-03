import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions";

// Initialize the Firebase Admin SDK once (do not initialize in other files).
admin.initializeApp();

setGlobalOptions({maxInstances: 10});

// Export all functions from their respective modules.
export {createStudentDoc} from "./triggers/createStudentDoc";
export {getVocabSession} from "./assignments/vocab/getVocabSession";
export {recordVocabResponse} from "./assignments/vocab/recordVocabResponse";

export {getProductionSession} from "./assignments/sentence-practice/production/getProductionSession";
export {prepareProductionContinueReview} from "./assignments/sentence-practice/production/prepareProductionContinueReview";

export {getTranslationSession} from "./assignments/sentence-practice/translation/getTranslationSession";
export {prepareTranslationContinueReview} from "./assignments/sentence-practice/translation/prepareTranslationContinueReview";

// Shared streaming generation pipeline for sentence-practice modes
// (Translation/Production): a fast enqueue callable flips the assignment's
// generationStatus, and a Firestore trigger streams questions into its
// `questions` subcollection as they are generated.
export {enqueueSessionGeneration} from "./assignments/sentence-practice/shared/question-generation/enqueue/enqueueSessionGeneration";
export {onAssignmentGenerationRequested} from "./assignments/sentence-practice/shared/question-generation/trigger/onAssignmentGenerationRequested";

// Shared two-phase grading for sentence-practice modes: phase 1 returns the
// score + corrected translation fast; phase 2 fills in teaching explanations.
export {evaluateSentencePracticeResponse} from "./assignments/sentence-practice/shared/answer-feedback/evaluate/evaluateSentencePracticeResponse";
export {generateSentencePracticeExplanation} from "./assignments/sentence-practice/shared/answer-feedback/explanation/generateSentencePracticeExplanation";
