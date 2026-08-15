import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/assignment_completion_status.dart';
import '../models/vocab_session_models.dart';
import '../services/vocab_session_api_calls.dart';

/// Immutable state for the vocab session: metadata + the working list of cards.
///
/// This is an in-memory cache of a persisted `user_assignments` doc (type
/// VOCAB), not the source of truth. Progress is written to Firestore on every
/// rating, so a refresh or cold start rehydrates the same wave instead of
/// drawing a new set of cards.
class VocabSessionState {
  const VocabSessionState({
    required this.session,
    required this.questions,
    required this.sessionDateKey,
    required this.userId,
    required this.completionStatus,
    this.completedQuestionCount = 0,
    this.totalQuestionCount = 0,
    this.cumulativeOffsetQuestionCount = 0,
  });

  final VocabSessionData session;

  /// Cards still to answer in this wave, in queue order. A card rated "Again"
  /// moves to the back (server-side too), so it reappears later.
  final List<VocabQuestion> questions;

  /// Calendar date key (YYYY-MM-DD) in the user's local timezone for which this session was loaded.
  final String sessionDateKey;

  /// Firebase UID that owns the cached session. This prevents an account
  /// switch from reusing the previous student's in-memory wave.
  final String userId;

  /// Where Home should render this wave. COMPLETED covers both "fully answered"
  /// and "a Continue review wave that hasn't been started yet".
  final AssignmentCompletionStatus completionStatus;

  /// Number of questions completed in the current wave only (0..total). Used
  /// alongside [cumulativeOffsetQuestionCount] to compute display labels and
  /// in-wave progress.
  final int completedQuestionCount;

  /// In-wave total (the number of cards drawn for this wave).
  final int totalQuestionCount;

  /// Sum of questions completed in earlier waves today (0 for the first
  /// daily wave). Set by the server when a "Continue review" wave is created.
  /// Used by:
  ///   - Home / session cumulative labels (e.g. "16/15")
  ///   - The in-wave progress bar rule: any wave with offset > 0 stays 100%
  ///     full (per product spec).
  final int cumulativeOffsetQuestionCount;

  /// Firestore id of the wave this state mirrors.
  String get assignmentId => session.assignmentId;

  /// True when the student's tutor hasn't assigned any vocab at all.
  bool get deckIsEmpty => session.deckIsEmpty;

  VocabSessionState copyWith({
    List<VocabQuestion>? questions,
    AssignmentCompletionStatus? completionStatus,
    int? completedQuestionCount,
  }) {
    return VocabSessionState(
      session: session,
      questions: questions ?? this.questions,
      sessionDateKey: sessionDateKey,
      userId: userId,
      completionStatus: completionStatus ?? this.completionStatus,
      completedQuestionCount:
          completedQuestionCount ?? this.completedQuestionCount,
      totalQuestionCount: totalQuestionCount,
      cumulativeOffsetQuestionCount: cumulativeOffsetQuestionCount,
    );
  }

  factory VocabSessionState.fromSession(VocabSessionData session) {
    return VocabSessionState(
      session: session,
      questions: List.from(session.questions),
      sessionDateKey: DateTime.now().toLocal().toIso8601String().substring(
        0,
        10,
      ),
      userId: FirebaseAuth.instance.currentUser?.uid ?? '',
      completionStatus: session.completionStatus,
      completedQuestionCount: session.completedQuestionCount,
      totalQuestionCount: session.totalQuestionCount,
      cumulativeOffsetQuestionCount: session.cumulativeOffsetQuestionCount,
    );
  }
}

/// Holds the day's wave. Fetches once per wave; the list is updated locally as
/// the user rates so navigating Home ↔ session costs no network call.
/// Not autoDispose so returning from home keeps the same list.
class VocabSessionNotifier extends Notifier<AsyncValue<VocabSessionState>> {
  @override
  AsyncValue<VocabSessionState> build() => const AsyncValue.loading();

  /// Load the wave if it isn't already cached. Serves from memory when the
  /// cache is for today and matches [assignmentId] (or none was requested);
  /// otherwise fetches the persisted wave from the server.
  Future<void> loadIfNeeded({String? assignmentId}) async {
    final current = state.value;
    final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(
      0,
      10,
    );
    final wantsCached =
        current != null &&
        current.sessionDateKey == todayKey &&
        current.userId == userId &&
        (assignmentId == null ||
            assignmentId.isEmpty ||
            assignmentId == current.assignmentId);
    if (wantsCached) return;

    await _fetch(assignmentId: assignmentId);
  }

  /// Force a refetch of [assignmentId] (or today's wave), bypassing the cache.
  Future<void> refresh({String? assignmentId}) =>
      _fetch(assignmentId: assignmentId);

  Future<void> _fetch({String? assignmentId}) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final session = await getVocabSession(assignmentId: assignmentId);
      return VocabSessionState.fromSession(session);
    });
  }

  /// Begin a new "Continue review" wave: asks the server to persist a fresh
  /// batch of due cards (carrying today's cumulative offset) and caches it.
  ///
  /// Idempotent server-side — if an unfinished wave already exists for today it
  /// is returned instead of creating another.
  ///
  /// Returns the new wave's id, or an empty string if the call failed — in
  /// which case the previously cached wave is kept so Home doesn't lose its
  /// vocab row.
  Future<String> startContinueReview() async {
    final previous = state;
    state = const AsyncValue.loading();
    final result = await AsyncValue.guard(() async {
      final session = await prepareVocabContinueReview();
      return VocabSessionState.fromSession(session);
    });
    state = result.hasError ? previous : result;
    return result.value?.assignmentId ?? '';
  }

  /// Called after rating. If [stillDueToday] is false, remove card at [index].
  /// If true, move card at [index] to the end so it reappears later — matching
  /// what the server did to the persisted queue.
  ///
  /// [completedQuestionCount] is the server's count, which stays authoritative.
  void applyRating(
    bool stillDueToday,
    int index,
    VocabQuestion q, {
    required int completedQuestionCount,
  }) {
    final current = state.value;
    if (current == null || index < 0 || index >= current.questions.length) {
      return;
    }
    final list = List<VocabQuestion>.from(current.questions);
    list.removeAt(index);
    if (stillDueToday) list.add(q);

    // Finishing the wave leaves the list empty; don't refetch (the server would
    // hand back the same finished wave, and a new wave is only started by an
    // explicit "Continue review").
    state = AsyncValue.data(
      current.copyWith(
        questions: list,
        completedQuestionCount: completedQuestionCount,
        completionStatus: list.isEmpty
            ? AssignmentCompletionStatus.completed
            : AssignmentCompletionStatus.todo,
      ),
    );
  }

  /// Removes a card immediately while the rating request is in flight. The
  /// server response later reconciles whether the card should return today.
  void applyRatingOptimistically(int index) {
    final current = state.value;
    if (current == null || index < 0 || index >= current.questions.length) {
      return;
    }

    final list = List<VocabQuestion>.from(current.questions)..removeAt(index);
    state = AsyncValue.data(
      current.copyWith(
        questions: list,
        completedQuestionCount: current.completedQuestionCount + 1,
        completionStatus: list.isEmpty
            ? AssignmentCompletionStatus.completed
            : AssignmentCompletionStatus.todo,
      ),
    );
  }

  /// Applies the server's due-today decision after an optimistic rating.
  void reconcileOptimisticRating({
    required VocabQuestion question,
    required bool stillDueToday,
    required int completedQuestionCount,
  }) {
    final current = state.value;
    if (current == null) return;

    final list = List<VocabQuestion>.from(current.questions);
    if (stillDueToday &&
        !list.any((q) => q.vocabCardId == question.vocabCardId)) {
      list.add(question);
    }
    state = AsyncValue.data(
      current.copyWith(
        questions: list,
        completedQuestionCount: completedQuestionCount,
        completionStatus: list.isEmpty
            ? AssignmentCompletionStatus.completed
            : AssignmentCompletionStatus.todo,
      ),
    );
  }

  /// Restores a card when the rating request fails.
  void rollbackOptimisticRating({
    required VocabQuestion question,
    required int index,
    required int completedQuestionCount,
  }) {
    final current = state.value;
    if (current == null ||
        current.questions.any((q) => q.vocabCardId == question.vocabCardId)) {
      return;
    }

    final list = List<VocabQuestion>.from(current.questions);
    final insertAt = index.clamp(0, list.length);
    list.insert(insertAt, question);
    state = AsyncValue.data(
      current.copyWith(
        questions: list,
        completedQuestionCount: completedQuestionCount,
        completionStatus: AssignmentCompletionStatus.todo,
      ),
    );
  }

  /// Clear so next open refetches (e.g. new day).
  void clear() {
    state = const AsyncValue.loading();
  }
}

final vocabSessionProvider =
    NotifierProvider<VocabSessionNotifier, AsyncValue<VocabSessionState>>(
      VocabSessionNotifier.new,
    );
