import 'package:cloud_functions/cloud_functions.dart';

import '../models/production_session_models.dart';

/// Placement of the daily Production assignment on Home.
///
/// - [todo]: user has not completed today's Production assignment yet.
/// - [completed]: user has already completed today's Production assignment.
enum ProductionDailyPlacement { todo, completed }

/// Lightweight "stub" status for the daily Production assignment.
///
/// Returned by the stub-only `getProductionSession` callable. Safe to fetch
/// from Home without triggering AI generation: counts will be 0/10 until the
/// user taps Start/Continue, at which point `startProductionSession` is
/// called to hydrate the assignment.
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
Future<ProductionDailyStatus> getProductionSession({required String userId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('getProductionSession');
  final result = await callable.call({
    'userId': userId,
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
/// navigate to the session page. AI generation itself happens lazily inside
/// [startProductionSession]; this call is fast and fire-and-forget safe.
Future<ProductionContinueReviewPreparation> prepareProductionContinueReview({required String userId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('prepareProductionContinueReview');
  final result = await callable.call({
    'userId': userId,
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

/// Hydrate a Production assignment and return the full session with
/// questions. Idempotent: the backend only runs AI generation once per
/// assignment; repeat calls return the existing questions.
Future<ProductionSessionData> startProductionSession({required String userId, required String assignmentId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('startProductionSession');
  final result = await callable.call({
    'userId': userId,
    'assignmentId': assignmentId,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'startProductionSession returned unexpected type: ${data.runtimeType}',
    );
  }

  return ProductionSessionData.fromJson(data);
}

class ProductionEvaluationResult {
  const ProductionEvaluationResult({
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
  final List<ProductionExplanation> explanations;
  final int completedQuestionCount;
  final int totalQuestionCount;
  final bool assignmentCompleted;
  final bool skipped;

  factory ProductionEvaluationResult.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ProductionEvaluationResult expected a Map, got ${json.runtimeType}',
      );
    }

    return ProductionEvaluationResult(
      score: (json['score'] as num?)?.toInt() ?? 0,
      feedback: (json['feedback'] as String?) ?? '',
      correctedVersion: (json['correctedVersion'] as String?) ?? '',
      correctedVersionSegments: (json['correctedVersionSegments'] as List?)?.map((e) => CorrectedSegment.fromJson(e)).toList(),
      explanations: (json['explanations'] as List?)?.map((e) => ProductionExplanation.fromJson(e)).toList() ?? [],
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      assignmentCompleted: (json['assignmentCompleted'] as bool?) ?? false,
      skipped: (json['skipped'] as bool?) ?? false,
    );
  }
}

Future<ProductionEvaluationResult> evaluateProductionResponse({
  required String assignmentId,
  required String userId,
  required int questionIndex,
  required String studentAnswer,
  bool useForeignCharacters = true,
}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('evaluateProductionResponse');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
    'questionIndex': questionIndex,
    'studentAnswer': studentAnswer,
    'useForeignCharacters': useForeignCharacters,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'evaluateProductionResponse returned unexpected type: ${data.runtimeType}',
    );
  }

  return ProductionEvaluationResult.fromJson(data);
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
