import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import {UserRecord} from "firebase-functions/v1/auth";

export const onAuthUserCreated = functions.auth.user().onCreate(async (user: UserRecord) => {
  const studentRef = admin.firestore().doc(`students/${user.uid}`);
  const existing = await studentRef.get();
  if (existing.exists) return;

  await studentRef.set({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    teacherId: null,
  });
});
