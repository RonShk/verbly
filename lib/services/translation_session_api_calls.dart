import 'package:cloud_functions/cloud_functions.dart';

import '../models/assignment_completion_status.dart';

/// Lightweight "stub" status for the daily Translation assignment.
///
/// Returned by the stub-only `getTranslationSession` callable. Safe to fetch
/// from Home without triggering AI generation: counts will be 0/10 until the
/// user taps Start/Continue, at which point `enqueueSessionGeneration` is
/// called to start streaming questions.
class TranslationDailyStatus {
  const TranslationDailyStatus({
    required this.completionStatus,
    required this.assignmentId,
    required this.teacher,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.cumulativeOffsetQuestionCount,
  });

  final AssignmentCompletionStatus completionStatus;

  /// Id of the todo doc in Firestore. Null when there is no active todo for
  /// today (only completed docs exist). When the user taps "Continue review"
  /// in that case, [prepareTranslationContinueReview] is called to create a
  /// new wave todo and return its id.
  final String? assignmentId;
  final String teacher;

  /// In-wave completed count for the current todo (0..total).
  final int completedQuestionCount;

  /// In-wave total for the current todo (e.g. 10).
  final int totalQuestionCount;

  /// Sum of [totalQuestionCount] across all completed Translation
  /// assignments for today. Combined with [completedQuestionCount] to render
  /// cumulative progress labels (e.g. "16/15") on Home and the session page.
  final int cumulativeOffsetQuestionCount;

  factory TranslationDailyStatus.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'TranslationDailyStatus expected a Map, got ${json.runtimeType}',
      );
    }
    return TranslationDailyStatus(
      completionStatus: assignmentCompletionStatusFromApi(json['completionStatus'] as String?),
      assignmentId: json['assignmentId'] as String?,
      teacher: (json['teacher'] as String?) ?? '',
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      cumulativeOffsetQuestionCount: (json['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Fetch today's Translation assignment status. Stub-only: does NOT generate
/// questions. Use this from Home to decide whether to show the card under
/// Todo vs Completed.
Future<TranslationDailyStatus> getTranslationSession() async {
  final callable = FirebaseFunctions.instance.httpsCallable('getTranslationSession');
  final result = await callable.call({
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'getTranslationSession returned unexpected type: ${data.runtimeType}',
    );
  }

  return TranslationDailyStatus.fromJson(data);
}

/// Result of [prepareTranslationContinueReview].
class TranslationContinueReviewPreparation {
  const TranslationContinueReviewPreparation({
    required this.assignmentId,
    required this.cumulativeOffsetQuestionCount,
    required this.totalQuestionCount,
  });

  final String assignmentId;
  final int cumulativeOffsetQuestionCount;
  final int totalQuestionCount;

  factory TranslationContinueReviewPreparation.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'TranslationContinueReviewPreparation expected a Map, got ${json.runtimeType}',
      );
    }
    return TranslationContinueReviewPreparation(
      assignmentId: (json['assignmentId'] as String?) ?? '',
      cumulativeOffsetQuestionCount: (json['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Create (or return) today's "Continue review" wave for Translation.
///
/// Used when the user taps "Continue review" on a completed Translation row.
/// Returns the new (or existing) todo's `assignmentId` so the client can
/// navigate to the session page. AI generation itself is started lazily via
/// `enqueueSessionGeneration`; this call is fast and fire-and-forget safe.
Future<TranslationContinueReviewPreparation> prepareTranslationContinueReview() async {
  final callable = FirebaseFunctions.instance.httpsCallable('prepareTranslationContinueReview');
  final result = await callable.call({
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'prepareTranslationContinueReview returned unexpected type: ${data.runtimeType}',
    );
  }

  return TranslationContinueReviewPreparation.fromJson(data);
}

// Question generation is started via the shared [enqueueSessionGeneration] in
// session_generation_api.dart; the session page then streams the question set
// doc from Firestore as questions arrive.
//
// Answer grading lives in the shared two-phase API
// [sentence_practice_evaluation_api.dart] (evaluateSentencePracticeResponse +
// generateSentencePracticeExplanation), used by both Translation and Production.
