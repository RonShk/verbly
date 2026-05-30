import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions";

// Initialize the Firebase Admin SDK once (do not initialize in other files).
admin.initializeApp();

setGlobalOptions({maxInstances: 10});

// Export all functions from their respective modules.
export {createStudentDoc} from "./triggers/createStudentDoc";
export {getVocabSession} from "./assignments/vocab/getVocabSession";
export {recordVocabResponse} from "./assignments/vocab/recordVocabResponse";

export {getProductionSession} from "./assignments/production/getProductionSession";
export {evaluateProductionResponse} from "./assignments/production/evaluateProductionResponse";
export {prepareProductionContinueReview} from "./assignments/production/prepareProductionContinueReview";

export {getTranslationSession} from "./assignments/translation/getTranslationSession";
export {evaluateTranslationResponse} from "./assignments/translation/evaluateTranslationResponse";
export {prepareTranslationContinueReview} from "./assignments/translation/prepareTranslationContinueReview";

// Shared streaming generation pipeline for sentence-practice modes
// (Translation/Production): a fast enqueue callable + Firestore triggers that
// stream questions into the question set docs as they are generated.
export {enqueueSessionGeneration} from "./assignments/shared/enqueueSessionGeneration";
export {onTranslationQuestionSetCreated, onProductionQuestionSetCreated} from "./assignments/shared/onQuestionSetCreated";
