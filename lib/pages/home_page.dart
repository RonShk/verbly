import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/home_page_models.dart';
import '../providers/production_session_provider.dart';
import '../providers/translation_session_provider.dart';
import '../providers/vocab_session_provider.dart';
import '../services/production_session_api_calls.dart';
import '../services/session_generation_api.dart';
import '../services/translation_session_api_calls.dart';
import '../theme/app_colors.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  Timer? _midnightTimer;

  /// Fires after the user dwells on Home for [_prefetchDwell]; we then kick off
  /// background generation for today's sentence-practice modes so questions are
  /// (partly) ready by the time they tap Start. Tied to a tangible engagement
  /// signal — lingering on Home — rather than generating for every user.
  Timer? _prefetchTimer;
  static const Duration _prefetchDwell = Duration(seconds: 6);
  bool _prefetchRequested = false;
  static const List<String> _modeOrder = ['VOCAB', 'PRODUCTION', 'TRANSLATION'];

  int _modeOrderIndex(String type) {
    final idx = _modeOrder.indexOf(type.toUpperCase());
    return idx == -1 ? _modeOrder.length : idx;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadModesIfNeeded();
      _scheduleMidnightTimer();
      _schedulePrefetch();
    });
  }

  /// Schedule a one-shot prefetch after the user has dwelled on Home. Idempotent
  /// per page lifetime (server-side enqueue is also idempotent per day).
  void _schedulePrefetch() {
    _prefetchTimer?.cancel();
    _prefetchTimer = Timer(_prefetchDwell, _prefetchSentenceModes);
  }

  /// Background-generate today's Translation/Production questions if they are
  /// still TODO with no progress. Fire-and-forget: failures are ignored (the
  /// session page will enqueue again on open).
  void _prefetchSentenceModes() {
    if (_prefetchRequested || !mounted) return;
    _prefetchRequested = true;

    final translation = ref.read(translationDailyProvider).value;
    if (translation != null &&
        translation.placement == TranslationDailyPlacement.todo &&
        translation.completedQuestionCount == 0 &&
        (translation.assignmentId?.isNotEmpty ?? false)) {
      enqueueSessionGeneration(assignmentId: translation.assignmentId!).ignore();
    }

    final production = ref.read(productionDailyProvider).value;
    if (production != null &&
        production.placement == ProductionDailyPlacement.todo &&
        production.completedQuestionCount == 0 &&
        (production.assignmentId?.isNotEmpty ?? false)) {
      enqueueSessionGeneration(assignmentId: production.assignmentId!).ignore();
    }
  }

  /// Kick off a stub-only status fetch for each mode if its per-day cache is
  /// missing. No AI generation happens here.
  void _loadModesIfNeeded() {
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);

    final vocabCache = ref.read(vocabSessionProvider).value;
    final hasTodayVocab = vocabCache != null && vocabCache.sessionDateKey == todayKey;
    if (!hasTodayVocab) {
      ref.read(vocabSessionProvider.notifier).loadIfNeeded('daily-vocab');
    }

    ref.read(translationDailyProvider.notifier).loadIfNeeded();
    ref.read(productionDailyProvider.notifier).loadIfNeeded();
  }

  void _scheduleMidnightTimer() {
    _midnightTimer?.cancel();
    final now = DateTime.now();
    final nextMidnight = DateTime(now.year, now.month, now.day + 1);
    final duration = nextMidnight.difference(now);
    _midnightTimer = Timer(duration, _onMidnight);
  }

  void _onMidnight() {
    ref.read(vocabSessionProvider.notifier).clear();
    ref.read(vocabSessionProvider.notifier).loadIfNeeded('daily-vocab');
    ref.read(translationDailyProvider.notifier).clear();
    ref.read(translationDailyProvider.notifier).loadIfNeeded();
    ref.read(productionDailyProvider.notifier).clear();
    ref.read(productionDailyProvider.notifier).loadIfNeeded();
    _scheduleMidnightTimer();
    _prefetchRequested = false;
    _schedulePrefetch();
  }

  @override
  void dispose() {
    _midnightTimer?.cancel();
    _prefetchTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final vocabSession = ref.watch(vocabSessionProvider);
    final translationDaily = ref.watch(translationDailyProvider);
    final productionDaily = ref.watch(productionDailyProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: _buildContent(
          context,
          vocabSession: vocabSession,
          translationDaily: translationDaily,
          productionDaily: productionDaily,
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context, {
    required AsyncValue<VocabSessionState> vocabSession,
    required AsyncValue<TranslationDailyState> translationDaily,
    required AsyncValue<ProductionDailyState> productionDaily,
  }) {
    final todoAssignments = <HomeAssignment>[];
    final completed = <HomeCompletion>[];

    _addVocabCards(
      vocabSession: vocabSession,
      todoAssignments: todoAssignments,
      completed: completed,
    );
    _addProductionCards(
      productionDaily: productionDaily,
      todoAssignments: todoAssignments,
      completed: completed,
    );
    _addTranslationCards(
      translationDaily: translationDaily,
      todoAssignments: todoAssignments,
      completed: completed,
    );

    // Ensure UI order is always: Vocab → Production → Translation.
    todoAssignments.sort((a, b) => _modeOrderIndex(a.type).compareTo(_modeOrderIndex(b.type)));
    completed.sort((a, b) => _modeOrderIndex(a.type).compareTo(_modeOrderIndex(b.type)));

    return CustomScrollView(
      slivers: [
        _buildHeader(context),
        SliverToBoxAdapter(child: _buildSectionHeader(context)),
        SliverList(
          delegate: SliverChildListDelegate(
            todoAssignments
                .map((a) => _AssignmentCard(
                      type: a.type,
                      teacher: a.teacher,
                      due: a.dueDate,
                      completedQuestionCount: a.completedQuestionCount,
                      totalQuestionCount: a.totalQuestionCount,
                      cumulativeOffsetQuestionCount: a.cumulativeOffsetQuestionCount,
                      buttonLabel: a.buttonLabel,
                      onTap: () => _onStartAssignment(context, a),
                    ))
                .toList(),
          ),
        ),
        SliverToBoxAdapter(child: _buildCompletedSection(context, completed)),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Per-mode card assembly
  // ---------------------------------------------------------------------------

  void _addVocabCards({ required AsyncValue<VocabSessionState> vocabSession, required List<HomeAssignment> todoAssignments, required List<HomeCompletion> completed,}) {
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
    final cache = vocabSession.value;
    final hasTodayCache = cache != null && cache.sessionDateKey == todayKey;
    final totalCount = hasTodayCache ? cache.session.totalQuestionCount : 0;
    final completedCount = hasTodayCache ? cache.completedQuestionCount : 0;
    final cumulativeOffset = hasTodayCache ? cache.cumulativeOffsetQuestionCount : 0;

    final isLoading = vocabSession.isLoading;
    final hasTodayAndEmpty = hasTodayCache && cache.questions.isEmpty;
    // A freshly-started "Continue review" wave (cumulativeOffset > 0) with
    // zero in-wave progress should remain under COMPLETED until the user
    // rates the first card; mirrors the T/P hideFromAssignmentsTabUntilFirstProgress flag.
    final isContinueReviewIdle = hasTodayCache && cumulativeOffset > 0 && completedCount == 0 && cache.questions.isNotEmpty;
    final showVocabCompleted = !isLoading && (hasTodayAndEmpty || isContinueReviewIdle);
    final showVocabAssignment = !showVocabCompleted;

    if (showVocabAssignment) {
      todoAssignments.add(
        HomeAssignment(
          id: 'daily-vocab',
          type: 'VOCAB',
          teacher: '',
          dueDate: 'Today',
          totalQuestionCount: totalCount,
          completedQuestionCount: completedCount,
          cumulativeOffsetQuestionCount: cumulativeOffset,
          buttonLabel: completedCount > 0 ? 'Continue' : 'Start',
        ),
      );
    }
    if (showVocabCompleted) {
      // For Continue review-idle (loaded but unstarted), passing the
      // assignmentId lets the button skip the prepare* step and go straight
      // to the session.
      completed.add(HomeCompletion(
        type: 'VOCAB',
        assignmentId: isContinueReviewIdle ? 'daily-vocab' : null,
      ));
    }
  }

  void _addTranslationCards({
    required AsyncValue<TranslationDailyState> translationDaily,
    required List<HomeAssignment> todoAssignments,
    required List<HomeCompletion> completed,
  }) {
    final state = translationDaily.value;
    if (state == null) return;
    if (state.placement == TranslationDailyPlacement.todo) {
      todoAssignments.add(
        HomeAssignment(
          id: state.assignmentId ?? '',
          type: 'TRANSLATION',
          teacher: state.teacher,
          dueDate: 'Today',
          totalQuestionCount: state.totalQuestionCount,
          completedQuestionCount: state.completedQuestionCount,
          cumulativeOffsetQuestionCount: state.cumulativeOffsetQuestionCount,
          buttonLabel: state.completedQuestionCount > 0 ? 'Continue' : 'Start',
        ),
      );
    } else {
      // The backend sets placement=COMPLETED both for "fully done today" and
      // for a wave-2+ that hasn't been started yet (hide flag set). In the
      // latter case, the assignmentId is non-null and we can navigate
      // directly without re-preparing.
      completed.add(HomeCompletion(
        type: 'TRANSLATION',
        assignmentId: state.assignmentId,
      ));
    }
  }

  void _addProductionCards({
    required AsyncValue<ProductionDailyState> productionDaily,
    required List<HomeAssignment> todoAssignments,
    required List<HomeCompletion> completed,
  }) {
    final state = productionDaily.value;
    if (state == null) return;
    if (state.placement == ProductionDailyPlacement.todo) {
      todoAssignments.add(
        HomeAssignment(
          id: state.assignmentId ?? '',
          type: 'PRODUCTION',
          teacher: state.teacher,
          dueDate: 'Today',
          totalQuestionCount: state.totalQuestionCount,
          completedQuestionCount: state.completedQuestionCount,
          cumulativeOffsetQuestionCount: state.cumulativeOffsetQuestionCount,
          buttonLabel: state.completedQuestionCount > 0 ? 'Continue' : 'Start',
        ),
      );
    } else {
      completed.add(HomeCompletion(
        type: 'PRODUCTION',
        assignmentId: state.assignmentId,
      ));
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  void _onStartAssignment(BuildContext context, HomeAssignment a) {
    final id = a.id;
    if (id.isEmpty) return;
    final routeType = a.type.toLowerCase();
    context.go('/assignment/$routeType/$id');
  }

  /// Wires the "Continue review" button on a completed-section row.
  ///
  /// Vocab: starts a new client-side wave (resets in-wave count, bumps
  /// cumulative offset) and refetches the next batch of due cards.
  ///
  /// Translation/Production: if the row already has an assignmentId (a
  /// wave-2+ todo that hasn't been started yet), navigates straight to the
  /// session page. Otherwise, calls the `prepare*ContinueReview` callable
  /// which creates a new wave-2 todo on the server, then navigates. AI
  /// generation runs lazily inside the session page's `start*Session`.
  VoidCallback? _onContinueCompleted(BuildContext context, HomeCompletion c) {
    switch (c.type) {
      case 'VOCAB':
        return () async {
          await ref.read(vocabSessionProvider.notifier).startContinueReview('daily-vocab');
          if (!context.mounted) return; 
          context.go('/assignment/vocab/daily-vocab');
        };
      case 'TRANSLATION':
        return () async {
          var assignmentId = c.assignmentId;
          if (assignmentId == null || assignmentId.isEmpty) {
            try {
              final prepared = await prepareTranslationContinueReview();
              assignmentId = prepared.assignmentId;
            } catch (_) {
              return;
            }
          }
          ref.read(translationDailyProvider.notifier).clear();
          if (!context.mounted) return;
          context.go('/assignment/translation/$assignmentId');
        };
      case 'PRODUCTION':
        return () async {
          var assignmentId = c.assignmentId;
          if (assignmentId == null || assignmentId.isEmpty) {
            try {
              final prepared = await prepareProductionContinueReview();
              assignmentId = prepared.assignmentId;
            } catch (_) {
              return;
            }
          }
          ref.read(productionDailyProvider.notifier).clear();
          if (!context.mounted) return;
          context.go('/assignment/production/$assignmentId');
        };
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Chrome widgets
  // ---------------------------------------------------------------------------

  Widget _buildHeader(BuildContext context) {
    return SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'STUDENT PORTAL',
                    style: TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Icon(
                        Icons.school_outlined,
                        color: Colors.white.withValues(alpha: 0.9),
                        size: 22,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Assignments',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.notifications_outlined),
              color: Colors.white.withValues(alpha: 0.9),
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          'ASSIGNMENTS',
          style: TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }

  Widget _buildCompletedSection(BuildContext context, List<HomeCompletion> completed) {
    if (completed.isEmpty) return const SizedBox(height: 24);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 20),
          child: CustomPaint(
            painter: _DashedLinePainter(color: AppColors.completedTabsBorder),
            child: const SizedBox(height: 1, width: double.infinity),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
          child: Text(
            'COMPLETED',
            style: TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
          ),
        ),
        ...completed.map((c) => _CompletedItem(
              title: c.type,
              subtitle: '',
              onContinue: _onContinueCompleted(context, c),
            )),
        const SizedBox(height: 24),
      ],
    );
  }
}

class _AssignmentCard extends StatelessWidget {
  const _AssignmentCard({
    required this.type,
    required this.teacher,
    required this.due,
    required this.completedQuestionCount,
    required this.totalQuestionCount,
    required this.cumulativeOffsetQuestionCount,
    required this.buttonLabel,
    required this.onTap,
  });

  final String type;
  final String teacher;
  final String due;
  final int completedQuestionCount;
  final int totalQuestionCount;
  final int cumulativeOffsetQuestionCount;
  final String buttonLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // Progress bar rules (per product spec):
    //  - First wave of the day (offset == 0): show in-wave fraction 0..1.
    //  - Any post–"Continue review" wave (offset > 0): always 100% full.
    final isContinueReviewWave = cumulativeOffsetQuestionCount > 0;
    final progressFraction = isContinueReviewWave ? 1.0 : (totalQuestionCount > 0 ? completedQuestionCount / totalQuestionCount : 0.0);

    // Cumulative numerator for the label. For wave 1 we keep "on card N"
    // semantics (completed+1 while at least one card remains) so a fresh
    // start reads "1/15" not "0/15"; for wave 2+ the numerator is the
    // straight cumulative count, so a freshly-started wave reads "15/15"
    // and the first answer bumps it to "16/15".
    final cumulativeNumerator = isContinueReviewWave ? cumulativeOffsetQuestionCount + completedQuestionCount : completedQuestionCount;

    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.cardBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  type,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              Text(
                teacher,
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 11,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(
                Icons.calendar_today_outlined,
                size: 12,
                color: AppColors.navbarInactive,
              ),
              const SizedBox(width: 4),
              Text(
                'Due: $due',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progressFraction,
                    minHeight: 6,
                    backgroundColor: AppColors.cardBorder,
                    valueColor: const AlwaysStoppedAnimation<Color>(AppColors.button),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '$cumulativeNumerator / $totalQuestionCount questions',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: onTap,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.button,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(buttonLabel),
                  const SizedBox(width: 8),
                  const Icon(Icons.arrow_forward, size: 18),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CompletedItem extends StatelessWidget {
  const _CompletedItem({
    required this.title,
    required this.subtitle,
    this.onContinue,
  });

  final String title;
  final String subtitle;
  final VoidCallback? onContinue;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 0, 20, 12),
      child: Stack(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.completedTabsBackground,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color: AppColors.success.withValues(alpha: 0.15),
                  ),
                  child: const Icon(Icons.check_circle, color: AppColors.success, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (subtitle.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: TextStyle(
                            color: AppColors.navbarInactive,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                if (onContinue != null)
                  TextButton(
                    onPressed: onContinue,
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.button,
                      backgroundColor: AppColors.button.withValues(alpha: 0.1),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                        side: BorderSide(color: AppColors.button.withValues(alpha: 0.2)),
                      ),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      minimumSize: Size.zero,
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          'Continue Review',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                        SizedBox(width: 6),
                        Icon(Icons.history, size: 16),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          Positioned.fill(
            child: IgnorePointer(
              child: CustomPaint(
                painter: _DashedRectPainter(
                  color: AppColors.completedTabsBorder,
                  borderRadius: 12,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DashedRectPainter extends CustomPainter {
  _DashedRectPainter({required this.color, this.borderRadius = 12});

  final Color color;
  final double borderRadius;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    final rrect = RRect.fromRectAndRadius(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Radius.circular(borderRadius),
    );
    final path = Path()..addRRect(rrect);
    final pathMetrics = path.computeMetrics();
    const dashWidth = 4.0;
    const dashSpace = 3.0;
    for (final metric in pathMetrics) {
      double distance = 0;
      while (distance < metric.length) {
        final end = (distance + dashWidth).clamp(0.0, metric.length);
        final extractPath = metric.extractPath(distance, end);
        canvas.drawPath(extractPath, paint);
        distance = end + dashSpace;
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _DashedLinePainter extends CustomPainter {
  _DashedLinePainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    const dashWidth = 6;
    const dashSpace = 4;
    double x = 0;
    while (x < size.width) {
      canvas.drawLine(Offset(x, 0), Offset(x + dashWidth, 0), paint);
      x += dashWidth + dashSpace;
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
