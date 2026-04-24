/// UI-level model for a card rendered in the Home "Assignments" (Todo) list.
///
/// Assembled client-side from the per-mode providers (Vocab, Translation,
/// Production); no longer parsed from a backend payload.
class HomeAssignment {
  const HomeAssignment({
    required this.id,
    required this.type,
    required this.teacher,
    required this.dueDate,
    required this.totalQuestionCount,
    required this.completedQuestionCount,
    required this.cumulativeOffsetQuestionCount,
    required this.buttonLabel,
  });

  final String id;
  final String type;
  final String teacher;
  final String dueDate;

  /// In-wave total (e.g. 10 for T/P, 15 for vocab).
  final int totalQuestionCount;

  /// In-wave completed (0..total).
  final int completedQuestionCount;

  /// Sum of completed questions across earlier waves today (0 for the first
  /// wave). Used to render cumulative labels (e.g. "16/15") and to decide if
  /// the progress bar should be 100% full (any wave with offset > 0).
  final int cumulativeOffsetQuestionCount;
  final String buttonLabel;
}

/// UI-level model for an entry in the Home "Completed" list.
class HomeCompletion {
  const HomeCompletion({
    required this.type,
    this.subtitle,
    this.assignmentId,
  });

  final String type;
  final String? subtitle;

  /// When non-null, tapping "Continue review" navigates straight to this
  /// already-prepared assignment id (e.g. a wave-2 todo that hasn't been
  /// started yet). When null, the Home flow calls the appropriate
  /// `prepare*ContinueReview` callable to create a new wave first.
  final String? assignmentId;
}
