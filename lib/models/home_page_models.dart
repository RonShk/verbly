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
    required this.buttonLabel,
  });

  final String id;
  final String type;
  final String teacher;
  final String dueDate;
  final int totalQuestionCount;
  final int completedQuestionCount;
  final String buttonLabel;
}

/// UI-level model for an entry in the Home "Completed" list.
class HomeCompletion {
  const HomeCompletion({
    required this.type,
    this.subtitle,
  });

  final String type;
  final String? subtitle;
}
