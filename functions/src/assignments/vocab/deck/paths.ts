import type {Firestore} from "firebase-admin/firestore";

export const DECK_COLLECTION = "student_vocab";
export const CARDS_SUBCOLLECTION = "cards";

export function deckRef(db: Firestore, studentUid: string) {
  return db.collection(DECK_COLLECTION).doc(studentUid);
}

export function deckCardsRef(db: Firestore, studentUid: string) {
  return deckRef(db, studentUid).collection(CARDS_SUBCOLLECTION);
}

export function deckCardRef(db: Firestore, studentUid: string, cardId: string) {
  return deckCardsRef(db, studentUid).doc(cardId);
}
