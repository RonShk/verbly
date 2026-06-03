import 'package:cloud_functions/cloud_functions.dart';

/// Metadata returned by [enqueueSessionGeneration]: enough to subscribe to the
/// assignment doc + its `questions` subcollection and render the session shell
/// while questions stream in.
class SessionEnqueueResult {
  const SessionEnqueueResult({
    required this.assignmentId,
    required this.status,
    required this.type,
    required this.assignmentTitle,
    required this.teacher,
    required this.totalQuestionCount,
    required this.completedQuestionCount,
    required this.cumulativeOffsetQuestionCount,
  });

  final String assignmentId;

  /// Generation lifecycle status: 'generating' | 'ready' | 'failed'.
  final String status;
  final String type;
  final String assignmentTitle;
  final String teacher;
  final int totalQuestionCount;
  final int completedQuestionCount;
  final int cumulativeOffsetQuestionCount;

  factory SessionEnqueueResult.fromJson(dynamic json) {
    if (json is! Map) {
      throw Exception('SessionEnqueueResult expected a Map, got ${json.runtimeType}');
    }
    return SessionEnqueueResult(
      assignmentId: (json['assignmentId'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'generating',
      type: (json['type'] as String?) ?? '',
      assignmentTitle: (json['assignmentTitle'] as String?) ?? '',
      teacher: (json['teacher'] as String?) ?? 'AI Generated',
      totalQuestionCount: (json['totalQuestionCount'] as num?)?.toInt() ?? 0,
      completedQuestionCount: (json['completedQuestionCount'] as num?)?.toInt() ?? 0,
      cumulativeOffsetQuestionCount: (json['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Fast, idempotent request to start (or resume) generating a sentence-practice
/// session's questions. Works for both Translation and Production — the backend
/// infers the mode from the assignment. Does NOT block on AI: the backend
/// creates/points at a question set doc and streams questions into it; the
/// client subscribes to that doc. Safe to call repeatedly (Home prefetch +
/// session page open + retry).
Future<SessionEnqueueResult> enqueueSessionGeneration({required String assignmentId}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('enqueueSessionGeneration');
  final result = await callable.call({'assignmentId': assignmentId});

  final data = result.data;
  if (data is! Map) {
    throw Exception('enqueueSessionGeneration returned unexpected type: ${data.runtimeType}');
  }

  return SessionEnqueueResult.fromJson(data);
}
