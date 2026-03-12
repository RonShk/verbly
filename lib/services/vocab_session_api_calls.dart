import 'package:cloud_functions/cloud_functions.dart';

import '../models/vocab_session_models.dart';

Future<VocabSessionData> getVocabSession({required String assignmentId, required String userId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('getVocabSession');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception('getVocabSession returned unexpected type: ${data.runtimeType}');
  }
  
  return VocabSessionData.fromJson(data);
}

/// Rating for FSRS: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
Future<VocabResponseResult> recordVocabResponse({required String userId, required String vocabCardId, required int rating, int? totalQuestionCount, int? completedQuestionCount,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('recordVocabResponse');
  final payload = <String, dynamic>{
    'userId': userId,
    'vocabCardId': vocabCardId,
    'rating': rating,
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  };

  if (totalQuestionCount != null) {
    payload['totalQuestionCount'] = totalQuestionCount;
  } 
  
  if (completedQuestionCount != null) {
    payload['completedQuestionCount'] = completedQuestionCount;
  }

  final result = await callable.call(payload);

  final data = result.data;
  if (data is! Map) {
    throw Exception('recordVocabResponse returned unexpected type: ${data.runtimeType}');
  }

  return VocabResponseResult(
    completedQuestionCount: (data['completedQuestionCount'] as num?)?.toInt() ?? 0,
    totalQuestionCount: (data['totalQuestionCount'] as num?)?.toInt() ?? 0,
    assignmentCompleted: (data['assignmentCompleted'] as bool?) ?? false,
    stillDueToday: (data['stillDueToday'] as bool?) ?? true,
  );
}

class VocabResponseResult {
  const VocabResponseResult({
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.assignmentCompleted,
    required this.stillDueToday,
  });

  final int completedQuestionCount;
  final int totalQuestionCount;
  final bool assignmentCompleted;
  /// If false, the card's new due date is past today; remove it from the session list.
  final bool stillDueToday;
}
