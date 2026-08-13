import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {deckRef} from "./deck/paths";

const db = admin.firestore();

/** Called when the student opens the app; updates deck lastActiveAt. */
export const touchStudentVocabLastActive = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const studentUid = context.auth.uid;
  const now = Timestamp.now();
  const deckDocRef = deckRef(db, studentUid);
  const existing = await deckDocRef.get();
  const lastActiveAt = existing.data()?.lastActiveAt;
  if (lastActiveAt && typeof lastActiveAt.toMillis === "function" && now.toMillis() - lastActiveAt.toMillis() < 5 * 60 * 1000) {
    return {ok: true, skipped: true};
  }

  await deckDocRef.set({
    studentUid,
    lastActiveAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  return {ok: true};
});
