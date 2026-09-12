import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

const USER_OWNED_QUERY_COLLECTIONS = [
  "user_assignments",
  "vocab_cards", // Legacy schema retained for accounts created before migration.
  "user_todo_assignments", // Legacy schema.
  "user_completed_assignments", // Legacy schema.
  "production_question_sets", // Legacy schema.
  "translation_question_sets", // Legacy schema.
  "ai_usage",
  "user_action_usage",
];

/** Deletes the authenticated student's personal data and Firebase Auth user. */
export const deleteAccount = functions.runWith({timeoutSeconds: 300, memory: "256MB"}).https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const uid = context.auth.uid;
  const db = admin.firestore();
  const user = await admin.auth().getUser(uid);
  const studentSnapshot = await db.doc(`students/${uid}`).get();
  const teacherId = studentSnapshot.data()?.teacherId;

  if (typeof teacherId === "string" && teacherId.length > 0) {
    await db.recursiveDelete(db.doc(`teachers/${teacherId}/students/${uid}`));
  }

  const invitationSnapshots = await Promise.all([
    db.collection("studentInvites").where("studentUid", "==", uid).get(),
    ...(user.email ? [
      db.collection("studentInvites")
        .where("email", "==", user.email.trim().toLowerCase())
        .get(),
    ] : []),
  ]);
  const invitationRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const snapshot of invitationSnapshots) {
    for (const doc of snapshot.docs) invitationRefs.set(doc.ref.path, doc.ref);
  }
  for (const ref of invitationRefs.values()) {
    await db.recursiveDelete(ref);
  }

  // recursiveDelete also removes subcollections, including vocab cards and
  // streamed assignment questions.
  await db.recursiveDelete(db.doc(`students/${uid}`));
  await db.recursiveDelete(db.doc(`student_vocab/${uid}`));

  for (const collectionName of USER_OWNED_QUERY_COLLECTIONS) {
    const snap = await db.collection(collectionName).where("userId", "==", uid).get();
    for (const doc of snap.docs) {
      await db.recursiveDelete(doc.ref);
    }
  }

  // Delete the Auth record last, so a partial Firestore cleanup cannot leave
  // the account permanently inaccessible before the operation finishes.
  await admin.auth().deleteUser(uid);
  return {ok: true};
});
