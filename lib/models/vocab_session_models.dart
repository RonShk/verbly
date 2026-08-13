import 'assignment_completion_status.dart';

/// Response from getVocabSession / prepareVocabContinueReview (VOCAB only).
///
/// Backed by a persisted `user_assignments` doc with type VOCAB, so the day's
/// cards and the progress through them survive an app refresh or restart.
class VocabSessionData {
  const VocabSessionData({
    required this.assignmentId,
    required this.type,
    required this.assignmentTitle,
    required this.teacher,
    required this.completionStatus,
    required this.totalQuestionCount,
    required this.completedQuestionCount,
    required this.cumulativeOffsetQuestionCount,
    required this.questions,
    required this.deckIsEmpty,
  });

  /// Firestore id of today's vocab wave.
  final String assignmentId;
  final String type;
  final String assignmentTitle;
  final String teacher;

  /// Server-side placement for Home: COMPLETED both when the wave is fully
  /// answered and when it is a not-yet-started "Continue review" wave.
  final AssignmentCompletionStatus completionStatus;
  final int totalQuestionCount;
  final int completedQuestionCount;

  /// Sum of [totalQuestionCount] across today's completed vocab waves. Used for
  /// cumulative labels (e.g. "16/15") after a "Continue review".
  final int cumulativeOffsetQuestionCount;

  /// Cards still to answer in this wave, in queue order.
  final List<VocabQuestion> questions;

  /// True when the student has no vocab cards at all — their tutor hasn't
  /// assigned any words. Distinguishes "done for today" from "nothing to do,
  /// ever", which need different messages.
  final bool deckIsEmpty;

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
      completionStatus: assignmentCompletionStatusFromApi(json['completionStatus'] as String?),
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      cumulativeOffsetQuestionCount: (json['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
      questions: (json['questions'] as List?)?.map((e) => VocabQuestion.fromJson(e)).toList() ?? [],
      deckIsEmpty: (json['deckIsEmpty'] as bool?) ?? false,
    );
  }
}

class VocabQuestion {
  const VocabQuestion({
    required this.index,
    required this.vocabCardId,
    required this.learningLanguageWord,
    required this.englishWord,
    this.isNew = false,
  });

  /// Stable id of this card within the wave (the question doc's id). Sent back
  /// with the rating so the server can mark the right question done.
  final int index;
  final String vocabCardId;
  final String learningLanguageWord;
  final String englishWord;
  final bool isNew;

  factory VocabQuestion.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception('VocabQuestion expected a Map, got ${json.runtimeType}');
    }

    return VocabQuestion(
      index: (json['index'] as num?)?.toInt() ?? 0,
      vocabCardId: (json['vocabCardId'] as String?) ?? '',
      learningLanguageWord: (json['learningLanguageWord'] as String?) ?? '',
      englishWord: (json['englishWord'] as String?) ?? '',
      isNew: (json['isNew'] as bool?) ?? false,
    );
  }
}
