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
  });

  final ProductionDailyPlacement placement;

  /// Id of the todo doc in Firestore; null when the assignment is already
  /// completed (moved to `user_completed_assignments`).
  final String? assignmentId;
  final String teacher;
  final int completedQuestionCount;
  final int totalQuestionCount;

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
}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('evaluateProductionResponse');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
    'questionIndex': questionIndex,
    'studentAnswer': studentAnswer,
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
