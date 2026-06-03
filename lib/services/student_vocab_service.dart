import 'package:cloud_functions/cloud_functions.dart';

/// Updates student_vocab/{uid}.lastActiveAt via Cloud Function (no client Firestore writes).
Future<void> touchStudentVocabLastActive() async {
  final callable = FirebaseFunctions.instance.httpsCallable('touchStudentVocabLastActive');
  await callable.call();
}
