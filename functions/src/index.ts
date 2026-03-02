import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions";

// Initialize the Firebase Admin SDK once (do not initialize in other files).
admin.initializeApp();

setGlobalOptions({ maxInstances: 10 });

// Export all functions from their respective modules.
export { getHomePageData } from "./home/getHomePageData";

export { getVocabSession } from "./assignments/vocab/getVocabSession";
export { recordVocabResponse } from "./assignments/vocab/recordVocabResponse";

export { generateReadingVocabQuestions } from "./assignments/reading_vocab/generateReadingVocabQuestions";
export { getReadingVocabSession } from "./assignments/reading_vocab/getReadingVocabSession";
export { recordReadingVocabResponse } from "./assignments/reading_vocab/recordReadingVocabResponse";
