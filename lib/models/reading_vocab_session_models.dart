class ReadingVocabSessionData {
  const ReadingVocabSessionData({
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
  final List<ReadingVocabQuestion> questions;

  factory ReadingVocabSessionData.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
        'ReadingVocabSessionData expected a Map, got ${json.runtimeType}');
    }

    return ReadingVocabSessionData(
      assignmentId: (json['assignmentId'] as String?) ?? '',
      type: (json['type'] as String?) ?? '',
      assignmentTitle: (json['assignmentTitle'] as String?) ?? '',
      teacher: (json['teacher'] as String?) ?? '',
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedQuestionCount:(json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      questions: (json['questions'] as List?) ?.map((e) => ReadingVocabQuestion.fromJson(e)).toList() ?? []
    );
  }
}

class ReadingVocabQuestion {
  const ReadingVocabQuestion({
    required this.index,
    required this.sentenceInLearningLanguage,
    required this.englishMeaning,
    required this.vocabWordsUsed,
  });

  final int index;
  final String sentenceInLearningLanguage;
  final String englishMeaning;
  final List<String> vocabWordsUsed;

  factory ReadingVocabQuestion.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception(
          'ReadingVocabQuestion expected a Map, got ${json.runtimeType}');
    }

    return ReadingVocabQuestion(
      index: (json['index'] as num?)?.toInt() ?? 0,
      sentenceInLearningLanguage: (json['sentenceInLearningLanguage'] as String?) ?? '',
      englishMeaning: (json['englishMeaning'] as String?) ?? '',
      vocabWordsUsed: (json['vocabWordsUsed'] as List?) ?.map((e) => e.toString()).toList() ?? []
    );
  }
}
