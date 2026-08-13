import * as admin from "firebase-admin";
import {deckCardsRef} from "./paths";

/**
 * True when the student has no vocab cards at all — i.e. their tutor hasn't
 * assigned any words yet. This is the one condition that no amount of retrying
 * can fix, so callers use it to stop before starting AI generation and to show
 * the student a "no words assigned" message instead of an error.
 *
 * Uses an aggregate count (one read regardless of deck size) rather than the
 * denormalized `totalCards` on the deck doc, which may be missing or stale for
 * decks seeded outside the normal flow.
 */
export async function isDeckEmpty(userId: string): Promise<boolean> {
  const snap = await deckCardsRef(admin.firestore(), userId).count().get();
  return snap.data().count === 0;
}
