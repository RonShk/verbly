import 'package:cloud_functions/cloud_functions.dart';

/// Placement of the daily Production assignment on Home.
///
/// - [todo]: user has not completed today's Production assignment yet.
/// - [completed]: user has already completed today's Production assignment.
enum ProductionDailyPlacement { todo, completed }

/// Lightweight "stub" status for the daily Production assignment.
///
/// Returned by the stub-only `getProductionSession` callable. Safe to fetch
/// from Home without triggering AI generation: counts will be 0/10 until the
/// user taps Start/Continue, at which point `enqueueSessionGeneration` is
/// called to start streaming questions.
class ProductionDailyStatus {
  const ProductionDailyStatus({
    required this.placement,
    required this.assignmentId,
    required this.teacher,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.cumulativeOffsetQuestionCount,
  });

  final ProductionDailyPlacement placement;

  /// Id of the todo doc in Firestore. Null when there is no active todo for
  /// today (only completed docs exist). When the user taps "Continue review"
  /// in that case, [prepareProductionContinueReview] is called to create a
  /// new wave todo and return its id.
  final String? assignmentId;
  final String teacher;

  /// In-wave completed count for the current todo (0..total).
  final int completedQuestionCount;

  /// In-wave total for the current todo (e.g. 10).
  final int totalQuestionCount;

  /// Sum of [totalQuestionCount] across all completed Production assignments
  /// for today. Combined with [completedQuestionCount] to render cumulative
  /// progress labels (e.g. "16/15") on Home and the session page.
  final int cumulativeOffsetQuestionCount;

  factory ProductionDailyStatus.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ProductionDailyStatus expected a Map, got ${json.runtimeType}',
      );
    }
    final placementStr = (json['placement'] as String?)?.toUpperCase() ?? 'TODO';
    final placement = placementStr == 'COMPLETED'
        ? ProductionDailyPlacement.completed
        : ProductionDailyPlacement.todo;
    return ProductionDailyStatus(
      placement: placement,
      assignmentId: json['assignmentId'] as String?,
      teacher: (json['teacher'] as String?) ?? '',
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      cumulativeOffsetQuestionCount: (json['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Fetch today's Production assignment status. Stub-only: does NOT generate
/// questions. Use this from Home to decide whether to show the card under
/// Todo vs Completed.
Future<ProductionDailyStatus> getProductionSession() async {
  final callable = FirebaseFunctions.instance.httpsCallable('getProductionSession');
  final result = await callable.call({
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'getProductionSession returned unexpected type: ${data.runtimeType}',
    );
  }

  return ProductionDailyStatus.fromJson(data);
}

/// Result of [prepareProductionContinueReview].
class ProductionContinueReviewPreparation {
  const ProductionContinueReviewPreparation({
    required this.assignmentId,
    required this.cumulativeOffsetQuestionCount,
    required this.totalQuestionCount,
  });

  final String assignmentId;
  final int cumulativeOffsetQuestionCount;
  final int totalQuestionCount;

  factory ProductionContinueReviewPreparation.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ProductionContinueReviewPreparation expected a Map, got ${json.runtimeType}',
      );
    }
    return ProductionContinueReviewPreparation(
      assignmentId: (json['assignmentId'] as String?) ?? '',
      cumulativeOffsetQuestionCount: (json['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Create (or return) today's "Continue review" wave for Production.
///
/// Used when the user taps "Continue review" on a completed Production row.
/// Returns the new (or existing) todo's `assignmentId` so the client can
/// navigate to the session page. AI generation itself is started lazily via
/// `enqueueSessionGeneration`; this call is fast and fire-and-forget safe.
Future<ProductionContinueReviewPreparation> prepareProductionContinueReview() async {
  final callable = FirebaseFunctions.instance.httpsCallable('prepareProductionContinueReview');
  final result = await callable.call({
    'timezoneOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'prepareProductionContinueReview returned unexpected type: ${data.runtimeType}',
    );
  }

  return ProductionContinueReviewPreparation.fromJson(data);
}

// Question generation is started via the shared [enqueueSessionGeneration] in
// session_generation_api.dart; the session page then streams the question set
// doc from Firestore as questions arrive.
//
// Answer grading lives in the shared two-phase API
// [sentence_practice_evaluation_api.dart] (evaluateSentencePracticeResponse +
// generateSentencePracticeExplanation), used by both Translation and Production.
