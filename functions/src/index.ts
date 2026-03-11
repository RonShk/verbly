import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions";

// Initialize the Firebase Admin SDK once (do not initialize in other files).
admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

// Export all functions from their respective modules.
export { getHomePageData } from "./home/getHomePageData";

export { getVocabSession } from "./assignments/vocab/getVocabSession";
export { recordVocabResponse } from "./assignments/vocab/recordVocabResponse";

export { getProductionSession } from "./assignments/production/getProductionSession";
export { evaluateProductionResponse } from "./assignments/production/evaluateProductionResponse";

export { getTranslationSession } from "./assignments/translation/getTranslationSession";
export { evaluateTranslationResponse } from "./assignments/translation/evaluateTranslationResponse";

export { addVocabWords } from "./teacher/addVocabWords";
