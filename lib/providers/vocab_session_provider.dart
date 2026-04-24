import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/vocab_session_models.dart';
import '../services/vocab_session_api_calls.dart';

/// Immutable state for the vocab session: metadata + the working list of questions.
class VocabSessionState {
  const VocabSessionState({
    required this.session,
    required this.questions,
    required this.sessionDateKey,
    this.completedQuestionCount = 0,
    this.cumulativeOffsetQuestionCount = 0,
  });

  final VocabSessionData session;
  final List<VocabQuestion> questions;

  /// Calendar date key (YYYY-MM-DD) in the user's local timezone for which this session was loaded.
  final String sessionDateKey;

  /// Number of questions completed in the current wave only (0..total). Used
  /// alongside [cumulativeOffsetQuestionCount] to compute display labels and
  /// in-wave progress.
  final int completedQuestionCount;

  /// Sum of questions completed in earlier waves today (0 for the first
  /// daily wave). Bumped by [VocabSessionNotifier.startContinueReview] when
  /// the user taps "Continue review" after finishing a wave. Used by:
  ///   - Home / session cumulative labels (e.g. "16/15")
  ///   - The in-wave progress bar rule: any wave with offset > 0 stays 100%
  ///     full (per product spec).
  final int cumulativeOffsetQuestionCount;
}

/// Holds the day's session. Fetches once per assignment; list is updated when user rates.
/// Not autoDispose so returning from home keeps the same list.
class VocabSessionNotifier extends Notifier<AsyncValue<VocabSessionState>> {
  @override
  AsyncValue<VocabSessionState> build() => const AsyncValue.loading();

  /// Load session if not already loaded for today. Refetch when cache is empty or for a different day.
  Future<void> loadIfNeeded(String assignmentId) async {
    final current = state.value;
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
    if (current != null && current.sessionDateKey == todayKey && current.questions.isNotEmpty) {
      return;
    }

    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
    
      final session = await getVocabSession(
          assignmentId: assignmentId,
          userId: demoUserId,
      );

      return VocabSessionState(
        session: session,
        questions: List.from(session.questions),
        sessionDateKey: todayKey,
        completedQuestionCount: session.completedQuestionCount,
      );
    });
  }

  /// Begin a new "Continue review" wave for vocab. Captures the cumulative
  /// offset from the just-finished wave, then refetches the next batch of
  /// due cards. Idempotent if called while a fresh wave is already loaded
  /// and untouched.
  ///
  /// Should only be invoked when the prior wave is fully consumed (questions
  /// list empty) — typically from Home's "Continue review" button or the
  /// session page's "All done!" CTA.
  Future<void> startContinueReview(String assignmentId) async {
    final current = state.value;
    final priorOffset = current?.cumulativeOffsetQuestionCount ?? 0;
    final justFinishedCount = current?.completedQuestionCount ?? 0;
    final newOffset = priorOffset + justFinishedCount;

    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final session = await getVocabSession(
        assignmentId: assignmentId,
        userId: demoUserId,
      );
      final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
      return VocabSessionState(
        session: session,
        questions: List.from(session.questions),
        sessionDateKey: todayKey,
        completedQuestionCount: session.completedQuestionCount,
        cumulativeOffsetQuestionCount: newOffset,
      );
    });
  }

  /// Called after rating. If [stillDueToday] is false, remove card at [index].
  /// If true, move card at [index] to the end so it reappears later.
  void applyRating(bool stillDueToday, int index, VocabQuestion q) {
    final current = state.value;
    if (current == null || index < 0 || index >= current.questions.length) return;
    final list = List<VocabQuestion>.from(current.questions);
    if (!stillDueToday) {
      list.removeAt(index);
    } else {
      list.removeAt(index);
      list.add(q);
    }

    final newCompleted = !stillDueToday ? current.completedQuestionCount + 1 : current.completedQuestionCount;

    if (list.isEmpty) {
      // User just finished the session; don't refetch (server might return more due cards and "reset").
      state = AsyncValue.data(
        VocabSessionState(
          session: current.session,
          questions: const [],
          sessionDateKey: current.sessionDateKey,
          completedQuestionCount: newCompleted,
          cumulativeOffsetQuestionCount: current.cumulativeOffsetQuestionCount,
        ),
      );
      return;
    }

    state = AsyncValue.data(
      VocabSessionState(
        session: current.session,
        questions: list,
        sessionDateKey: current.sessionDateKey,
        completedQuestionCount: newCompleted,
        cumulativeOffsetQuestionCount: current.cumulativeOffsetQuestionCount,
      ),
    );
  }

  /// Clear so next open refetches (e.g. new day).
  void clear() {
    state = const AsyncValue.loading();
  }
}

final vocabSessionProvider = NotifierProvider<VocabSessionNotifier, AsyncValue<VocabSessionState>>(
  VocabSessionNotifier.new,
);
