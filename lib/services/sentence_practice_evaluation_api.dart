import 'package:cloud_functions/cloud_functions.dart';

/// One segment of a corrected translation, used to render the red/green diff in
/// the feedback view. Shared by Translation and Production.
class CorrectedSegment {
  const CorrectedSegment({required this.text, required this.highlight});

  final String text;

  /// One of 'none' (unchanged), 'wrong' (the student's incorrect word), or
  /// 'correct' (the correction).
  final String highlight;

  factory CorrectedSegment.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception('CorrectedSegment expected a Map, got ${json.runtimeType}');
    }
    return CorrectedSegment(
      text: (json['text'] as String?) ?? '',
      highlight: (json['highlight'] as String?) ?? 'none',
    );
  }
}

/// Phase 1 evaluation result: the fast, gating part of feedback (score +
/// corrected translation). Explanations are produced separately in phase 2 and
/// streamed onto the question doc, not returned here.
class SentencePracticePhase1Result {
  const SentencePracticePhase1Result({
    required this.score,
    required this.correctedVersion,
    this.correctedVersionSegments,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.assignmentCompleted,
    this.skipped = false,
  });

  final int score;
  final String correctedVersion;
  final List<CorrectedSegment>? correctedVersionSegments;
  final int completedQuestionCount;
  final int totalQuestionCount;
  final bool assignmentCompleted;
  final bool skipped;

  factory SentencePracticePhase1Result.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception('SentencePracticePhase1Result expected a Map, got ${json.runtimeType}');
    }
    return SentencePracticePhase1Result(
      score: (json['score'] as num?)?.toInt() ?? 0,
      correctedVersion: (json['correctedVersion'] as String?) ?? '',
      correctedVersionSegments: (json['correctedVersionSegments'] as List?)?.map((e) => CorrectedSegment.fromJson(e)).toList(),
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      assignmentCompleted: (json['assignmentCompleted'] as bool?) ?? false,
      skipped: (json['skipped'] as bool?) ?? false,
    );
  }
}

/// Phase 1: grade an answer and get the corrected translation back fast. The
/// backend infers the mode (Translation/Production) from the assignment.
/// `useForeignCharacters` is only meaningful for Production; Translation ignores it.
Future<SentencePracticePhase1Result> evaluateSentencePracticeResponse({
  required String assignmentId,
  required int questionIndex,
  required String studentAnswer,
  bool useForeignCharacters = true,
}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('evaluateSentencePracticeResponse');
  final result = await callable.call({
    'assignmentId': assignmentId,
    'questionIndex': questionIndex,
    'studentAnswer': studentAnswer,
    'useForeignCharacters': useForeignCharacters,
  });

  final data = result.data;
  if (data is! Map) {
    throw Exception('evaluateSentencePracticeResponse returned unexpected type: ${data.runtimeType}');
  }

  return SentencePracticePhase1Result.fromJson(data);
}

/// Phase 2: generate teaching explanations for an already-graded question. Fire
/// without awaiting after phase 1: results are written onto the question doc and
/// arrive via the session stream (`explanationStatus` + `explanations`).
Future<void> generateSentencePracticeExplanation({
  required String assignmentId,
  required int questionIndex,
  bool useForeignCharacters = true,
}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('generateSentencePracticeExplanation');
  await callable.call({
    'assignmentId': assignmentId,
    'questionIndex': questionIndex,
    'useForeignCharacters': useForeignCharacters,
  });
}
