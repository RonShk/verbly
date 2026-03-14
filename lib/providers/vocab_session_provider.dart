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
  });

  final VocabSessionData session;
  final List<VocabQuestion> questions;
  /// Calendar date key (YYYY-MM-DD) in the user's local timezone for which this session was loaded.
  final String sessionDateKey;
  /// Number of questions completed this session (rated and no longer due today). Used so progress shows 1/15, 2/15, etc. instead of 0/14, 0/13.
  final int completedQuestionCount;
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
