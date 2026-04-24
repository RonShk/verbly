import 'package:cloud_functions/cloud_functions.dart';

import '../models/translation_session_models.dart';

/// Placement of the daily Translation assignment on Home.
///
/// - [todo]: user has not completed today's Translation assignment yet.
/// - [completed]: user has already completed today's Translation assignment.
enum TranslationDailyPlacement { todo, completed }

/// Lightweight "stub" status for the daily Translation assignment.
///
/// Returned by the stub-only `getTranslationSession` callable. Safe to fetch
/// from Home without triggering AI generation: counts will be 0/10 until the
/// user taps Start/Continue, at which point `startTranslationSession` is
/// called to hydrate the assignment.
class TranslationDailyStatus {
  const TranslationDailyStatus({
    required this.placement,
    required this.assignmentId,
    required this.teacher,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.cumulativeOffsetQuestionCount,
  });

  final TranslationDailyPlacement placement;

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
    final placementStr = (json['placement'] as String?)?.toUpperCase() ?? 'TODO';
    final placement = placementStr == 'COMPLETED'
        ? TranslationDailyPlacement.completed
        : TranslationDailyPlacement.todo;
    return TranslationDailyStatus(
      placement: placement,
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
Future<TranslationDailyStatus> getTranslationSession({required String userId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('getTranslationSession');
  final result = await callable.call({
    'userId': userId,
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
/// navigate to the session page. AI generation itself happens lazily inside
/// [startTranslationSession]; this call is fast and fire-and-forget safe.
Future<TranslationContinueReviewPreparation> prepareTranslationContinueReview({required String userId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('prepareTranslationContinueReview');
  final result = await callable.call({
    'userId': userId,
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

/// Hydrate a Translation assignment and return the full session with
/// questions. Idempotent: the backend only runs AI generation once per
/// assignment; repeat calls return the existing questions.
Future<TranslationSessionData> startTranslationSession({required String userId, required String assignmentId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('startTranslationSession');
  final result = await callable.call({
    'userId': userId,
    'assignmentId': assignmentId,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'startTranslationSession returned unexpected type: ${data.runtimeType}',
    );
  }

  return TranslationSessionData.fromJson(data);
}

class TranslationEvaluationResult {
  const TranslationEvaluationResult({
    required this.score,
    required this.feedback,
    required this.correctedVersion,
    this.correctedVersionSegments,
    required this.explanations,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.assignmentCompleted,
    this.skipped = false,
  });

  final int score;
  final String feedback;
  final String correctedVersion;
  final List<CorrectedSegment>? correctedVersionSegments;
  final List<TranslationExplanation> explanations;
  final int completedQuestionCount;
  final int totalQuestionCount;
  final bool assignmentCompleted;
  final bool skipped;

  factory TranslationEvaluationResult.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'TranslationEvaluationResult expected a Map, got ${json.runtimeType}',
      );
    }

    return TranslationEvaluationResult(
      score: (json['score'] as num?)?.toInt() ?? 0,
      feedback: (json['feedback'] as String?) ?? '',
      correctedVersion: (json['correctedVersion'] as String?) ?? '',
      correctedVersionSegments: (json['correctedVersionSegments'] as List?)?.map((e) => CorrectedSegment.fromJson(e)).toList(),
      explanations: (json['explanations'] as List?)?.map((e) => TranslationExplanation.fromJson(e)).toList() ?? [],
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      assignmentCompleted: (json['assignmentCompleted'] as bool?) ?? false,
      skipped: (json['skipped'] as bool?) ?? false,
    );
  }
}

Future<TranslationEvaluationResult> evaluateTranslationResponse({
  required String assignmentId,
  required String userId,
  required int questionIndex,
  required String studentAnswer,
}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('evaluateTranslationResponse');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
    'questionIndex': questionIndex,
    'studentAnswer': studentAnswer,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'evaluateTranslationResponse returned unexpected type: ${data.runtimeType}',
    );
  }

  return TranslationEvaluationResult.fromJson(data);
}

class CorrectedSegment {
  const CorrectedSegment({
    required this.text,
    required this.highlight,
  });

  final String text;
  final String highlight;

  factory CorrectedSegment.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'CorrectedSegment expected a Map, got ${json.runtimeType}',
      );
    }

    return CorrectedSegment(
      text: (json['text'] as String?) ?? '',
      highlight: (json['highlight'] as String?) ?? 'none',
    );
  }
}
