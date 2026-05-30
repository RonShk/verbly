import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/production_session_models.dart';
import '../services/production_session_api_calls.dart';
import '../services/session_generation_api.dart';

/// Immutable daily state for Production used by Home.
///
/// Cached per-day via [sessionDateKey] (YYYY-MM-DD in local tz). Invalidated
/// at midnight (mirrors vocab).
class ProductionDailyState {
  const ProductionDailyState({
    required this.placement,
    required this.assignmentId,
    required this.teacher,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.cumulativeOffsetQuestionCount,
    required this.sessionDateKey,
  });

  final ProductionDailyPlacement placement;
  final String? assignmentId;
  final String teacher;
  final int completedQuestionCount;
  final int totalQuestionCount;

  /// Sum of [totalQuestionCount] across all completed Production assignments
  /// for today. Used by Home to render cumulative labels (e.g. "16/15") and
  /// to decide if the progress bar should be 100% full (any wave-2+ has
  /// offset > 0).
  final int cumulativeOffsetQuestionCount;
  final String sessionDateKey;
}

/// Home-level notifier for today's Production assignment status.
///
/// Calls the stub-only `getProductionSession` callable; does NOT hydrate
/// questions. Questions are hydrated only via [productionSessionStreamProvider]
/// when the user taps Start/Continue.
class ProductionDailyNotifier extends Notifier<AsyncValue<ProductionDailyState>> {
  @override
  AsyncValue<ProductionDailyState> build() => const AsyncValue.loading();

  /// Fetch today's placement/counts. Skipped if already cached for today.
  Future<void> loadIfNeeded() async {
    final current = state.value;
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
    if (current != null && current.sessionDateKey == todayKey) {
      return;
    }

    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final dto = await getProductionSession();
      return ProductionDailyState(
        placement: dto.placement,
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

final productionDailyProvider =
    NotifierProvider<ProductionDailyNotifier, AsyncValue<ProductionDailyState>>(
  ProductionDailyNotifier.new,
);

/// Family keyed by `assignmentId` that streams a Production session.
///
/// 1. Enqueues generation (idempotent, non-blocking) and gets the question set
///    id + session metadata.
/// 2. Subscribes to both the assignment doc (live progress counts) and the
///    question set doc (questions appended as they are generated), emitting a
///    merged [ProductionSessionData] whenever either changes.
///
/// This lets the session page show question 1 the moment it streams in, rather
/// than blocking until all questions exist.
final productionSessionStreamProvider =
    StreamProvider.autoDispose.family<ProductionSessionData, String>(
  (ref, assignmentId) async* {
    final enqueue = await enqueueSessionGeneration(assignmentId: assignmentId);
    yield* _streamProductionSession(enqueue);
  },
);

Stream<ProductionSessionData> _streamProductionSession(SessionEnqueueResult enqueue) {
  final firestore = FirebaseFirestore.instance;
  final assignmentStream = firestore.collection('user_todo_assignments').doc(enqueue.assignmentId).snapshots();
  final questionSetStream = firestore.collection('production_question_sets').doc(enqueue.questionSetId).snapshots();

  final controller = StreamController<ProductionSessionData>();
  DocumentSnapshot<Map<String, dynamic>>? assignmentSnap;
  DocumentSnapshot<Map<String, dynamic>>? questionSetSnap;

  void emit() {
    if (questionSetSnap == null) return;
    final qs = questionSetSnap!.data() ?? const {};
    final assignment = assignmentSnap?.data();

    final status = (qs['status'] as String?) ?? enqueue.status;
    if (status == 'failed') {
      controller.addError(Exception((qs['error'] as String?) ?? 'Generation failed.'));
      return;
    }

    final rawQuestions = (qs['questions'] as List?) ?? const [];
    final questions = rawQuestions.map((e) => ProductionQuestion.fromJson(e)).toList()..sort((a, b) => a.index.compareTo(b.index));

    // The todo doc is deleted once the wave is completed; fall back to enqueue
    // metadata and treat the wave as fully answered in that window.
    final completed = (assignment?['completedQuestionCount'] as num?)?.toInt() ?? (assignment == null ? enqueue.totalQuestionCount : enqueue.completedQuestionCount);
    final total = (assignment?['totalQuestionCount'] as num?)?.toInt() ?? enqueue.totalQuestionCount;
    final cumulativeOffset = (assignment?['cumulativeOffsetQuestionCount'] as num?)?.toInt() ?? enqueue.cumulativeOffsetQuestionCount;
    final teacher = (assignment?['teacher'] as String?) ?? enqueue.teacher;

    controller.add(ProductionSessionData(
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
  final questionSetSub = questionSetStream.listen((s) {
    questionSetSnap = s;
    emit();
  }, onError: controller.addError);

  controller.onCancel = () async {
    await assignmentSub.cancel();
    await questionSetSub.cancel();
  };

  return controller.stream;
}
