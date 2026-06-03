/// Whether a daily sentence-practice wave is still open or finished.
enum AssignmentCompletionStatus { todo, completed }

AssignmentCompletionStatus assignmentCompletionStatusFromApi(String? raw) {
  return (raw ?? 'TODO').toUpperCase() == 'COMPLETED' ? AssignmentCompletionStatus.completed : AssignmentCompletionStatus.todo;
}
