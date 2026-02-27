/// Response from getVocabSession (VOCAB assignment type only).
class VocabSessionData {
  const VocabSessionData({
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
  final List<VocabQuestion> questions;

  factory VocabSessionData.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
          'VocabSessionData expected a Map, got ${json.runtimeType}');
    }
    return VocabSessionData(
      assignmentId: (json['assignmentId'] as String?) ?? '',
      type: (json['type'] as String?) ?? '',
      assignmentTitle: (json['assignmentTitle'] as String?) ?? '',
      teacher: (json['teacher'] as String?) ?? '',
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedQuestionCount:
          (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      questions: (json['questions'] as List?)
              ?.map((e) => VocabQuestion.fromJson(e))
              .toList() ??
          [],
    );
  }
}

class VocabQuestion {
  const VocabQuestion({
    required this.index,
    required this.learningLanguageWord,
    required this.englishWord,
  });

  final int index;
  final String learningLanguageWord;
  final String englishWord;

  factory VocabQuestion.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception('VocabQuestion expected a Map, got ${json.runtimeType}');
    }
    return VocabQuestion(
      index: (json['index'] as num?)?.toInt() ?? 0,
      learningLanguageWord:
          (json['learningLanguageWord'] as String?) ?? '',
      englishWord: (json['englishWord'] as String?) ?? '',
    );
  }
}
