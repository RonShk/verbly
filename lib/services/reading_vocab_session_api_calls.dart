import 'package:cloud_functions/cloud_functions.dart';

import '../models/reading_vocab_session_models.dart';

Future<ReadingVocabSessionData> getReadingVocabSession({required String assignmentId, required String userId,}) async {

  final callable = FirebaseFunctions.instance.httpsCallable('getReadingVocabSession');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
        'getReadingVocabSession returned unexpected type: ${data.runtimeType}');
  }

  return ReadingVocabSessionData.fromJson(data);
}

Future<ReadingVocabResponseResult> recordReadingVocabResponse({required String assignmentId, required String userId, required int questionIndex,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('recordReadingVocabResponse');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
    'questionIndex': questionIndex,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
        'recordReadingVocabResponse returned unexpected type: ${data.runtimeType}');
  }

  return ReadingVocabResponseResult(
    completedQuestionCount: (data['completedQuestionCount'] as num?)?.toInt() ?? 0,
    totalQuestionCount: (data['totalQuestionCount'] as num?)?.toInt() ?? 0,
    assignmentCompleted: (data['assignmentCompleted'] as bool?) ?? false,
  );
}

class ReadingVocabResponseResult {
  const ReadingVocabResponseResult({
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.assignmentCompleted,
  });

  final int completedQuestionCount;
  final int totalQuestionCount;
  final bool assignmentCompleted;
}
