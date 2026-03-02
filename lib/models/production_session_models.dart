class ProductionSessionData {
  const ProductionSessionData({
    required this.assignmentId,
    required this.type,
    required this.assignmentTitle,
    required this.teacher,
    required this.totalQuestionCount,
    required this.completedQuestionCount,
    required this.questions,
  });

  final String assignmentId;
  final String type;
  final String assignmentTitle;
  final String teacher;
  final int totalQuestionCount;
  final int completedQuestionCount;
  final List<ProductionQuestion> questions;

  factory ProductionSessionData.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ProductionSessionData expected a Map, got ${json.runtimeType}',
      );
    }

    return ProductionSessionData(
      assignmentId: (json['assignmentId'] as String?) ?? '',
      type: (json['type'] as String?) ?? '',
      assignmentTitle: (json['assignmentTitle'] as String?) ?? '',
      teacher: (json['teacher'] as String?) ?? '',
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      questions: (json['questions'] as List?)?.map((e) => ProductionQuestion.fromJson(e)).toList() ??[]
    );
  }
}

class ProductionQuestion {
  const ProductionQuestion({
    required this.index,
    required this.sentenceInNativeLanguage,
    required this.vocabWordsUsed,
    this.studentAnswer,
    this.aiEvaluation,
  });

  final int index;
  final String sentenceInNativeLanguage;
  final List<String> vocabWordsUsed;
  final String? studentAnswer;
  final ProductionAiEvaluation? aiEvaluation;

  factory ProductionQuestion.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ProductionQuestion expected a Map, got ${json.runtimeType}',
      );
    }

    return ProductionQuestion(
      index: (json['index'] as num?)?.toInt() ?? 0,
      sentenceInNativeLanguage: (json['sentenceInNativeLanguage'] as String?) ?? '',
      vocabWordsUsed: (json['vocabWordsUsed'] as List?)?.map((e) => e.toString()).toList() ?? [],
      studentAnswer: json['studentAnswer'] as String?,
      aiEvaluation: json['aiEvaluation'] != null
          ? ProductionAiEvaluation.fromJson(json['aiEvaluation'])
          : null,
    );
  }
}

class ProductionAiEvaluation {
  const ProductionAiEvaluation({
    required this.score,
    required this.feedback,
    required this.correctedVersion,
    required this.explanations,
  });

  final int score;
  final String feedback;
  final String correctedVersion;
  final List<ProductionExplanation> explanations;

  factory ProductionAiEvaluation.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ProductionAiEvaluation expected a Map, got ${json.runtimeType}',
      );
    }

    return ProductionAiEvaluation(
      score: (json['score'] as num?)?.toInt() ?? 0,
      feedback: (json['feedback'] as String?) ?? '',
      correctedVersion: (json['correctedVersion'] as String?) ?? '',
      explanations: (json['explanations'] as List?) ?.map((e) => ProductionExplanation.fromJson(e)).toList() ?? [],
    );
  }
}

class ProductionExplanation {
  const ProductionExplanation({
    required this.category,
    required this.detail,
  });

  final String category;
  final String detail;

  factory ProductionExplanation.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ProductionExplanation expected a Map, got ${json.runtimeType}',
      );
    }

    return ProductionExplanation(
      category: (json['category'] as String?) ?? '',
      detail: (json['detail'] as String?) ?? '',
    );
  }
}
