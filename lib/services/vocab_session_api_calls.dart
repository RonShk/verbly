import 'package:cloud_functions/cloud_functions.dart';

import '../models/vocab_session_models.dart';

Future<VocabSessionData> getVocabSession({required String assignmentId, required String userId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('getVocabSession');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception('getVocabSession returned unexpected type: ${data.runtimeType}');
  }
  
  return VocabSessionData.fromJson(data);
}

Future<VocabResponseResult> recordVocabResponse({required String assignmentId, required String userId, required int questionIndex,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('recordVocabResponse');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
    'questionIndex': questionIndex,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception('recordVocabResponse returned unexpected type: ${data.runtimeType}');
  }
  
  return VocabResponseResult(
    completedQuestionCount: (data['completedQuestionCount'] as num?)?.toInt() ?? 0,
    totalQuestionCount: (data['totalQuestionCount'] as num?)?.toInt() ?? 0,
    assignmentCompleted: (data['assignmentCompleted'] as bool?) ?? false,
  );
}

class VocabResponseResult {
  const VocabResponseResult({
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.assignmentCompleted,
  });

  final int completedQuestionCount;
  final int totalQuestionCount;
  final bool assignmentCompleted;
}
