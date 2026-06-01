import * as admin from "firebase-admin";

/** Shared Firebase Admin init for scripts under src/test/. */
export function ensureFirebaseApp(): void {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT ?? "vocab-forge-78557",
    credential: admin.credential.applicationDefault(),
  });
}
