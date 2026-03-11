import 'package:cloud_functions/cloud_functions.dart';

import '../models/translation_session_models.dart';

Future<TranslationSessionData> getTranslationSession({required String userId}) async {
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
