import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/translation_session_models.dart';
import '../services/translation_session_api_calls.dart';

/// Immutable daily state for Translation used by Home.
///
/// Cached per-day via [sessionDateKey] (YYYY-MM-DD in local tz). Invalidated
/// at midnight (mirrors vocab).
class TranslationDailyState {
  const TranslationDailyState({
    required this.placement,
    required this.assignmentId,
    required this.teacher,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.sessionDateKey,
  });

  final TranslationDailyPlacement placement;
  final String? assignmentId;
  final String teacher;
  final int completedQuestionCount;
  final int totalQuestionCount;
  final String sessionDateKey;
}

/// Home-level notifier for today's Translation assignment status.
///
/// Calls the stub-only `getTranslationSession` callable; does NOT hydrate
/// questions. Questions are hydrated only via [translationStartSessionProvider]
/// when the user taps Start/Continue.
class TranslationDailyNotifier extends Notifier<AsyncValue<TranslationDailyState>> {
  @override
  AsyncValue<TranslationDailyState> build() => const AsyncValue.loading();

  /// Fetch today's placement/counts. Skipped if already cached for today.
  Future<void> loadIfNeeded() async {
    final current = state.value;
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
    if (current != null && current.sessionDateKey == todayKey) {
      return;
    }

    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
    final dto = await getTranslationSession(userId: demoUserId);
    return TranslationDailyState(
        placement: dto.placement,
        assignmentId: dto.assignmentId,
        teacher: dto.teacher,
        completedQuestionCount: dto.completedQuestionCount,
        totalQuestionCount: dto.totalQuestionCount,
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

/// Family keyed by `assignmentId` that hydrates a Translation assignment and
/// returns the full [TranslationSessionData] with questions.
///
/// Calls `startTranslationSession` on the backend, which may invoke AI
/// generation (only on first hydration; subsequent calls for the same
/// assignment are idempotent). Watched by the Translation session page.
final translationStartSessionProvider =
    FutureProvider.autoDispose.family<TranslationSessionData, String>(
  (ref, assignmentId) async {
    return startTranslationSession(
      userId: demoUserId,
      assignmentId: assignmentId,
    );
  },
);
