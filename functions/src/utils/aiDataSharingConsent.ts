import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v1";

export async function hasAiDataSharingConsent(userId: string): Promise<boolean> {
  const snapshot = await admin.firestore().doc(`students/${userId}`).get();
  return snapshot.data()?.aiDataSharingConsentAt != null;
}

export async function assertAiDataSharingConsent(userId: string): Promise<void> {
  if (!await hasAiDataSharingConsent(userId)) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "AI data sharing permission is required for this practice mode.",
    );
  }
}
