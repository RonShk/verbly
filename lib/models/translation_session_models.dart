import '../services/sentence_practice_evaluation_api.dart';

class TranslationSessionData {
  const TranslationSessionData({
    required this.assignmentId,
    required this.type,
    required this.assignmentTitle,
    required this.teacher,
    required this.totalQuestionCount,
    required this.completedQuestionCount,
    required this.cumulativeOffsetQuestionCount,
    required this.questions,
    this.generationStatus = 'ready',
  });

  final String assignmentId;
  final String type;
  final String assignmentTitle;
  final String teacher;
  final int totalQuestionCount;
  final int completedQuestionCount;

  /// Streaming generation status of the underlying question set:
  /// 'generating' | 'ready' | 'failed'. The session page uses this to decide
  /// between showing a loader (more questions on the way) and the completed
  /// view (genuinely out of questions).
  final String generationStatus;

  /// Sum of [totalQuestionCount] across all already-completed Translation
  /// assignments for today (0 for the first daily wave). Used by the session
  /// page to render cumulative labels and to decide whether to fill the
  /// progress bar to 100% (any wave with offset > 0).
  final int cumulativeOffsetQuestionCount;
  final List<TranslationQuestion> questions;

  factory TranslationSessionData.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'TranslationSessionData expected a Map, got ${json.runtimeType}',
      );
    }

    return TranslationSessionData(
      assignmentId: (json['assignmentId'] as String?) ?? '',
      type: (json['type'] as String?) ?? '',
      assignmentTitle: (json['assignmentTitle'] as String?) ?? '',
      teacher: (json['teacher'] as String?) ?? '',
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      cumulativeOffsetQuestionCount: (json['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
      questions: (json['questions'] as List?)?.map((e) => TranslationQuestion.fromJson(e)).toList() ?? [],
      generationStatus: (json['generationStatus'] as String?) ?? 'ready',
    );
  }
}

class TranslationQuestion {
  const TranslationQuestion({
    required this.index,
    required this.sentenceInLearningLanguage,
    required this.vocabWordsUsed,
    this.studentAnswer,
    this.aiEvaluation,
  });

  final int index;
  final String sentenceInLearningLanguage;
  final List<String> vocabWordsUsed;
  final String? studentAnswer;
  final TranslationAiEvaluation? aiEvaluation;

  factory TranslationQuestion.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'TranslationQuestion expected a Map, got ${json.runtimeType}',
      );
    }

    return TranslationQuestion(
      index: (json['index'] as num?)?.toInt() ?? 0,
      sentenceInLearningLanguage:
          (json['sentenceInLearningLanguage'] as String?) ?? '',
      vocabWordsUsed: (json['vocabWordsUsed'] as List?)?.map((e) => e.toString()).toList() ?? [],
      studentAnswer: json['studentAnswer'] as String?,
      aiEvaluation: json['aiEvaluation'] != null ? TranslationAiEvaluation.fromJson(json['aiEvaluation']): null,
    );
  }
}

class TranslationAiEvaluation {
  const TranslationAiEvaluation({
    required this.score,
    required this.feedback,
    required this.correctedVersion,
    this.correctedVersionSegments,
    required this.explanations,
    this.explanationStatus = 'ready',
  });

  final int score;
  final String feedback;
  final String correctedVersion;
  final List<CorrectedSegment>? correctedVersionSegments;
  final List<TranslationExplanation> explanations;

  /// Phase-2 explanation generation status: 'generating' | 'ready' | 'failed'.
  /// Defaults to 'ready' so legacy docs without the field render normally.
  final String explanationStatus;

  factory TranslationAiEvaluation.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'TranslationAiEvaluation expected a Map, got ${json.runtimeType}',
      );
    }

    return TranslationAiEvaluation(
      score: (json['score'] as num?)?.toInt() ?? 0,
      feedback: (json['feedback'] as String?) ?? '',
      correctedVersion: (json['correctedVersion'] as String?) ?? '',
      correctedVersionSegments: (json['correctedVersionSegments'] as List?)?.map((e) => CorrectedSegment.fromJson(e)).toList(),
      explanations: (json['explanations'] as List?)?.map((e) => TranslationExplanation.fromJson(e)).toList() ?? [],
      explanationStatus: (json['explanationStatus'] as String?) ?? 'ready',
    );
  }
}

class TranslationExplanation {
  const TranslationExplanation({
    required this.category,
    required this.detail,
  });

  final String category;
  final String detail;

  factory TranslationExplanation.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'TranslationExplanation expected a Map, got ${json.runtimeType}',
      );
    }

    return TranslationExplanation(
      category: (json['category'] as String?) ?? '',
      detail: (json['detail'] as String?) ?? '',
    );
  }
}
