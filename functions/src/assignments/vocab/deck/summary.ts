import {FieldValue} from "firebase-admin/firestore";
import type {StateBucket, StateCounts} from "./types";

const EMPTY_STATE_COUNTS: StateCounts = {new: 0, learning: 0, review: 0, relearning: 0};

/** Maps FSRS state enum to a summary bucket. */
export function fsrsStateToBucket(state: number): StateBucket {
  if (state === 0) return "new";
  if (state === 1) return "learning";
  if (state === 2) return "review";
  if (state === 3) return "relearning";
  return "new";
}

export function buildStateCounts(states: number[]): StateCounts {
  const counts: StateCounts = {...EMPTY_STATE_COUNTS};
  for (const state of states) {
    counts[fsrsStateToBucket(state)]++;
  }
  return counts;
}

/** Firestore merge fields to adjust stateCounts when a card transitions state. */
export function stateCountDelta(oldState: number, newState: number): Record<string, FirebaseFirestore.FieldValue> {
  const oldBucket = fsrsStateToBucket(oldState);
  const newBucket = fsrsStateToBucket(newState);
  if (oldBucket === newBucket) return {};
  return {
    [`stateCounts.${oldBucket}`]: FieldValue.increment(-1),
    [`stateCounts.${newBucket}`]: FieldValue.increment(1),
  };
}

export function emptyStateCounts(): StateCounts {
  return {...EMPTY_STATE_COUNTS};
}
