import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";
import {FieldValue} from "firebase-admin/firestore";

const db = admin.firestore();

type InviteCandidate = FirebaseFirestore.DocumentReference;

/**
 * Connects the authenticated student to the tutor invitation addressed to
 * their Firebase email. The code never reaches the student app.
 */
export const acceptStudentInvite = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const studentUid = context.auth.uid;
  const studentUser = await admin.auth().getUser(studentUid);
  const studentEmail = studentUser.email?.trim().toLowerCase();
  if (!studentEmail) {
    throw new functions.https.HttpsError("failed-precondition", "A verified email is required.");
  }

  const invites = db.collection("studentInvites");
  const [emailMatches, uidMatches] = await Promise.all([
    invites.where("email", "==", studentEmail).limit(20).get(),
    invites.where("studentUid", "==", studentUid).limit(20).get(),
  ]);

  const candidateRefs: InviteCandidate[] = [];
  for (const snapshot of [emailMatches, uidMatches]) {
    for (const doc of snapshot.docs) {
      if (!candidateRefs.some((ref) => ref.path === doc.ref.path)) {
        candidateRefs.push(doc.ref);
      }
    }
  }

  if (candidateRefs.length === 0) {
    throw new functions.https.HttpsError("not-found", "No pending tutor invitation was found for this account.");
  }

  const result = await db.runTransaction(async (transaction) => {
    let acceptedInvite: FirebaseFirestore.DocumentData | undefined;
    let acceptedRef: InviteCandidate | undefined;

    // Reads happen inside the transaction so two simultaneous app starts
    // cannot both accept the same invitation.
    for (const candidateRef of candidateRefs) {
      const snapshot = await transaction.get(candidateRef);
      if (!snapshot.exists) continue;
      const invite = snapshot.data() ?? {};
      const status = String(invite.status ?? "");
      const expiresAt = invite.expiresAt;
      const email = typeof invite.email === "string" ? invite.email.trim().toLowerCase() : "";
      const inviteStudentUid = typeof invite.studentUid === "string" ? invite.studentUid : null;
      const validStatus = status === "pending" || status === "sent";
      const validExpiry = expiresAt && typeof expiresAt.toMillis === "function" && expiresAt.toMillis() > Date.now();
      const belongsToStudent = inviteStudentUid === studentUid || email === studentEmail;
      if (validStatus && validExpiry && belongsToStudent) {
        acceptedInvite = invite;
        acceptedRef = candidateRef;
        break;
      }
    }

    if (!acceptedInvite || !acceptedRef) {
      throw new functions.https.HttpsError("not-found", "No pending tutor invitation was found for this account.");
    }

    const teacherUid = typeof acceptedInvite.teacherUid === "string" ? acceptedInvite.teacherUid : "";
    if (!teacherUid) {
      throw new functions.https.HttpsError("failed-precondition", "The tutor invitation is incomplete.");
    }

    const acceptedAt = FieldValue.serverTimestamp();
    const rosterRef = db.doc(`teachers/${teacherUid}/students/${studentUid}`);
    const studentRef = db.doc(`students/${studentUid}`);
    transaction.update(acceptedRef, {
      status: "accepted",
      acceptedAt,
    });
    transaction.set(rosterRef, {
      name: studentUser.displayName ?? studentEmail,
      email: studentEmail,
      inviteStatus: "accepted",
      inviteAcceptedAt: acceptedAt,
    }, {merge: true});
    transaction.set(studentRef, {
      teacherId: teacherUid,
      inviteAcceptedAt: acceptedAt,
    }, {merge: true});

    return {teacherUid};
  });

  return {accepted: true, teacherUid: result.teacherUid};
});

