import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

/**
 * Daily per-user quota for non-AI state-changing actions. This intentionally
 * uses the authenticated UID rather than IP so shared networks are not
 * accidentally throttled.
 */
export async function consumeDailyUserActionQuota(
  context: functions.https.CallableContext,
  action: string,
  limit: number,
): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const day = new Date().toISOString().slice(0, 10);
  const ref = admin.firestore().doc(`user_action_usage/${context.auth.uid}_${day}`);
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = typeof snap.data()?.[action] === "number" ? snap.data()![action] as number : 0;
    if (current >= limit) {
      throw new functions.https.HttpsError("resource-exhausted", "Daily continue-review limit reached. Please try again tomorrow.");
    }
    tx.set(ref, {
      uid: context.auth!.uid,
      [action]: current + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
  });
}
