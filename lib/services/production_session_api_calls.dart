import 'package:cloud_functions/cloud_functions.dart';

import '../models/production_session_models.dart';

Future<ProductionSessionData> getProductionSession({required String assignmentId, required String userId,}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('getProductionSession');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'userId': userId,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception(
      'getProductionSession returned unexpected type: ${data.runtimeType}',
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
  });

  final int score;
  final String feedback;
  final String correctedVersion;
  final List<CorrectedSegment>? correctedVersionSegments;
  final List<ProductionExplanation> explanations;
  final int completedQuestionCount;
  final int totalQuestionCount;
  final bool assignmentCompleted;

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
    );
  }
}

Future<ProductionEvaluationResult> evaluateProductionResponse({required String assignmentId, required String userId, required int questionIndex, required String studentAnswer,}) async {
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
