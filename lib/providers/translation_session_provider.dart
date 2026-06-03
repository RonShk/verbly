import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/assignment_completion_status.dart';
import '../models/translation_session_models.dart';
import '../services/session_generation_api.dart';
import '../services/translation_session_api_calls.dart';

/// Immutable daily state for Translation used by Home.
///
/// Cached per-day via [sessionDateKey] (YYYY-MM-DD in local tz). Invalidated
/// at midnight (mirrors vocab).
class TranslationDailyState {
  const TranslationDailyState({
    required this.completionStatus,
    required this.assignmentId,
    required this.teacher,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.cumulativeOffsetQuestionCount,
    required this.sessionDateKey,
  });

  final AssignmentCompletionStatus completionStatus;
  final String? assignmentId;
  final String teacher;
  final int completedQuestionCount;
  final int totalQuestionCount;

  /// Sum of [totalQuestionCount] across all completed Translation
  /// assignments for today. Used by Home to render cumulative labels
  /// (e.g. "16/15") and to decide if the progress bar should be 100% full
  /// (any wave-2+ has offset > 0).
  final int cumulativeOffsetQuestionCount;
  final String sessionDateKey;
}

/// Home-level notifier for today's Translation assignment status.
///
/// Calls the stub-only `getTranslationSession` callable; does NOT hydrate
/// questions. Questions are hydrated only via [translationSessionStreamProvider]
/// when the user taps Start/Continue.
class TranslationDailyNotifier extends Notifier<AsyncValue<TranslationDailyState>> {
  @override
  AsyncValue<TranslationDailyState> build() => const AsyncValue.loading();

  /// Fetch today's completion status/counts. Skipped if already cached for today.
  Future<void> loadIfNeeded() async {
    final current = state.value;
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
    if (current != null && current.sessionDateKey == todayKey) {
      return;
    }

    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
    final dto = await getTranslationSession();
    return TranslationDailyState(
        completionStatus: dto.completionStatus,
        assignmentId: dto.assignmentId,
        teacher: dto.teacher,
        completedQuestionCount: dto.completedQuestionCount,
        totalQuestionCount: dto.totalQuestionCount,
        cumulativeOffsetQuestionCount: dto.cumulativeOffsetQuestionCount,
        sessionDateKey: todayKey,
      );
    });
  }

  /// Drop the cached state so the next [loadIfNeeded] refetches
  /// (e.g. on midnight rollover or after completing the assignment).
  void clear() {
    state = const AsyncValue.loading();
  }
}

final translationDailyProvider = NotifierProvider<TranslationDailyNotifier, AsyncValue<TranslationDailyState>>(TranslationDailyNotifier.new,);

/// Family keyed by `assignmentId` that streams a Translation session.
///
/// 1. Enqueues generation (idempotent, non-blocking) and gets session metadata.
/// 2. Subscribes to both the assignment doc (live progress counts + generation
///    status) and its `questions` subcollection (one doc per question, appended
///    as they are generated), emitting a merged [TranslationSessionData]
///    whenever either changes.
///
/// This lets the session page show question 1 the moment it streams in, rather
/// than blocking until all questions exist.
final translationSessionStreamProvider = StreamProvider.autoDispose.family<TranslationSessionData, String>((ref, assignmentId) async* {
    final enqueue = await enqueueSessionGeneration(assignmentId: assignmentId);
    yield* _streamTranslationSession(enqueue);
  },
);

Stream<TranslationSessionData> _streamTranslationSession(SessionEnqueueResult enqueue) {
  final assignmentRef = FirebaseFirestore.instance.collection('user_assignments').doc(enqueue.assignmentId);
  final assignmentStream = assignmentRef.snapshots();
  final questionsStream = assignmentRef.collection('questions').orderBy('index').snapshots();

  final controller = StreamController<TranslationSessionData>();
  DocumentSnapshot<Map<String, dynamic>>? assignmentSnap;
  QuerySnapshot<Map<String, dynamic>>? questionsSnap;

  void emit() {
    if (assignmentSnap == null) return;
    final assignment = assignmentSnap!.data();
    if (assignment == null) return;

    final status = (assignment['generationStatus'] as String?) ?? enqueue.status;
    if (status == 'failed') {
      controller.addError(Exception((assignment['generationError'] as String?) ?? 'Generation failed.'));
      return;
    }

    final questions = (questionsSnap?.docs ?? const []).map((d) => TranslationQuestion.fromJson(d.data())).toList()..sort((a, b) => a.index.compareTo(b.index));

    final completed = (assignment['completedQuestionCount'] as num?)?.toInt() ?? enqueue.completedQuestionCount;
    final total = (assignment['totalQuestionCount'] as num?)?.toInt() ?? enqueue.totalQuestionCount;
    final cumulativeOffset = (assignment['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? enqueue.cumulativeOffsetQuestionCount;
    final teacher = (assignment['teacher'] as String?) ?? enqueue.teacher;

    controller.add(TranslationSessionData(
      assignmentId: enqueue.assignmentId,
      type: enqueue.type,
      assignmentTitle: enqueue.assignmentTitle,
      teacher: teacher,
      totalQuestionCount: total,
      completedQuestionCount: completed,
      cumulativeOffsetQuestionCount: cumulativeOffset,
      questions: questions,
      generationStatus: status,
    ));
  }

  final assignmentSub = assignmentStream.listen((s) {
    assignmentSnap = s;
    emit();
  }, onError: controller.addError);
  final questionsSub = questionsStream.listen((s) {
    questionsSnap = s;
    emit();
  }, onError: controller.addError);

  controller.onCancel = () async {
    await assignmentSub.cancel();
    await questionsSub.cancel();
  };

  return controller.stream;
}
