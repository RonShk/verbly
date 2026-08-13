import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as functions from "firebase-functions/v1";

type AiOperation = "evaluation" | "explanation" | "generation";

// Generous for normal use, but finite enough to stop loops and replay abuse.
const DAILY_LIMITS: Record<AiOperation, number> = {
  evaluation: 100,
  explanation: 100,
  generation: 10,
};

const IP_WINDOW_MS = 60_000;
const IP_WINDOW_LIMIT = 60;

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function getClientIp(context: functions.https.CallableContext): string | null {
  const ip = context.rawRequest?.ip;
  return typeof ip === "string" && ip.length > 0 ? ip : null;
}

/** Reserves quota before a Gemini request is started. */
export async function consumeAiQuota(context: functions.https.CallableContext, operation: AiOperation): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }

  const now = new Date();
  const db = admin.firestore();
  const usageRef = db.doc(`ai_usage/${context.auth.uid}_${dayKey(now)}`);
  const ip = getClientIp(context);
  const ipRef = ip ? db.doc(`ai_ip_rate_limits/${hash(ip)}`) : null;
  const nowMs = now.getTime();

  await db.runTransaction(async (tx) => {
    const usageSnap = await tx.get(usageRef);
    const usage = usageSnap.data() ?? {};
    const current = typeof usage[operation] === "number" ? usage[operation] as number : 0;
    if (current >= DAILY_LIMITS[operation]) {
      throw new functions.https.HttpsError("resource-exhausted", `Daily ${operation} limit reached. Please try again tomorrow.`);
    }

    let ipData: admin.firestore.DocumentData | undefined;
    let nextIpCount = 0;
    if (ipRef) {
      const ipSnap = await tx.get(ipRef);
      ipData = ipSnap.data();
      const windowStartedAt = typeof ipData?.windowStartedAt === "number" ? ipData.windowStartedAt as number : 0;
      const ipCount = typeof ipData?.count === "number" ? ipData.count as number : 0;
      nextIpCount = nowMs - windowStartedAt < IP_WINDOW_MS ? ipCount + 1 : 1;
      if (nextIpCount > IP_WINDOW_LIMIT) {
        throw new functions.https.HttpsError("resource-exhausted", "Too many AI requests. Please slow down and try again shortly.");
      }
    }

    tx.set(usageRef, {
      [operation]: current + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    if (ipRef) {
      const windowStartedAt = typeof ipData?.windowStartedAt === "number" ? ipData.windowStartedAt as number : 0;
      tx.set(ipRef, {
        windowStartedAt: nowMs - windowStartedAt < IP_WINDOW_MS ? windowStartedAt : nowMs,
        count: nextIpCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    }
  });
}
