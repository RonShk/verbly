import 'package:cloud_functions/cloud_functions.dart';

import '../models/vocab_session_models.dart';

/// Fetch the persisted vocab wave for today.
///
/// Pass [assignmentId] to open a specific wave (e.g. a deep link into
/// `/assignment/vocab/<id>`); omit it to let the server resolve — or create —
/// today's wave. Either way the returned cards and progress come from
/// Firestore, so reloading the app resumes where the user left off.
Future<VocabSessionData> getVocabSession({String? assignmentId}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('getVocabSession');
  final payload = <String, dynamic>{
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  };

  if (assignmentId != null && assignmentId.isNotEmpty) {
    payload['assignmentId'] = assignmentId;
  }

  final result = await callable.call(payload);

  final data = result.data;
  if (data is! Map) {
    throw Exception('getVocabSession returned unexpected type: ${data.runtimeType}');
  }

  return VocabSessionData.fromJson(data);
}

/// Create (or return) today's "Continue review" wave for vocab: a fresh batch
/// of due cards persisted as a new assignment, carrying the cumulative offset
/// from the waves already finished today.
Future<VocabSessionData> prepareVocabContinueReview() async {
  final callable = FirebaseFunctions.instance.httpsCallable('prepareVocabContinueReview');
  final result = await callable.call({
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception('prepareVocabContinueReview returned unexpected type: ${data.runtimeType}');
  }

  return VocabSessionData.fromJson(data);
}

/// Rating for FSRS: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
///
/// Advances the card's FSRS schedule and the persisted assignment in one
/// transaction; the returned counts are the server's, not the client's.
Future<VocabResponseResult> recordVocabResponse({required String assignmentId, required int questionIndex, required String vocabCardId, required int rating,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('recordVocabResponse');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'questionIndex': questionIndex,
    'vocabCardId': vocabCardId,
    'rating': rating,
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception('recordVocabResponse returned unexpected type: ${data.runtimeType}');
  }

  return VocabResponseResult(
    completedQuestionCount: (data['completedQuestionCount'] as num?)?.toInt() ?? 0,
    totalQuestionCount: (data['totalQuestionCount'] as num?)?.toInt() ?? 0,
    cumulativeOffsetQuestionCount: (data['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
    assignmentCompleted: (data['assignmentCompleted'] as bool?) ?? false,
    stillDueToday: (data['stillDueToday'] as bool?) ?? true,
  );
}

class VocabResponseResult {
  const VocabResponseResult({
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.cumulativeOffsetQuestionCount,
    required this.assignmentCompleted,
    required this.stillDueToday,
  });

  final int completedQuestionCount;
  final int totalQuestionCount;
  final int cumulativeOffsetQuestionCount;
  final bool assignmentCompleted;
  /// If false, the card's new due date is past today; remove it from the session list.
  final bool stillDueToday;
}
