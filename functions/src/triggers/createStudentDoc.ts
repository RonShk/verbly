import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";

export const createStudentDoc = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const {uid, token} = context.auth;
  const studentRef = admin.firestore().doc(`students/${uid}`);
  await admin.firestore().runTransaction(async (tx) => {
    const existing = await tx.get(studentRef);
    if (existing.exists) return;
    tx.set(studentRef, {
      createdAt: FieldValue.serverTimestamp(),
      displayName: token.name ?? null,
      email: token.email ?? null,
      teacherId: null,
    });
  });
});
