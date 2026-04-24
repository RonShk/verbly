import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions";

// Initialize the Firebase Admin SDK once (do not initialize in other files).
admin.initializeApp();

setGlobalOptions({maxInstances: 10});

// Export all functions from their respective modules.
export {getVocabSession} from "./assignments/vocab/getVocabSession";
export {recordVocabResponse} from "./assignments/vocab/recordVocabResponse";

export {getProductionSession} from "./assignments/production/getProductionSession";
export {startProductionSession} from "./assignments/production/startProductionSession";
export {evaluateProductionResponse} from "./assignments/production/evaluateProductionResponse";
export {prepareProductionContinueReview} from "./assignments/production/prepareProductionContinueReview";

export {getTranslationSession} from "./assignments/translation/getTranslationSession";
export {startTranslationSession} from "./assignments/translation/startTranslationSession";
export {evaluateTranslationResponse} from "./assignments/translation/evaluateTranslationResponse";
export {prepareTranslationContinueReview} from "./assignments/translation/prepareTranslationContinueReview";

export {addVocabWords} from "./teacher/addVocabWords";
