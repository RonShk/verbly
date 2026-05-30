import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

export const createStudentDoc = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const {uid, token} = context.auth;
  const studentRef = admin.firestore().doc(`students/${uid}`);
  const existing = await studentRef.get();
  if (existing.exists) return;

  await studentRef.set({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    displayName: token.name ?? null,
    email: token.email ?? null,
    teacherId: null,
  });
});
