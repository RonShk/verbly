import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/production_session_models.dart';
import '../services/production_session_api_calls.dart';

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
/// questions. Questions are hydrated only via [productionStartSessionProvider]
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

/// Family keyed by `assignmentId` that hydrates a Production assignment and
/// returns the full [ProductionSessionData] with questions.
///
/// Calls `startProductionSession` on the backend, which may invoke AI
/// generation (only on first hydration; subsequent calls for the same
/// assignment are idempotent). Watched by the Production session page.
final productionStartSessionProvider =
    FutureProvider.autoDispose.family<ProductionSessionData, String>(
  (ref, assignmentId) async {
    return startProductionSession(assignmentId: assignmentId);
  },
);
