import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/home_page_models.dart';
import '../providers/home_page_provider.dart';
import '../providers/vocab_session_provider.dart';
import '../theme/app_colors.dart';

class HomePage extends ConsumerStatefulWidget {
  const HomePage({super.key});

  @override
  ConsumerState<HomePage> createState() => _HomePageState();
}

class _HomePageState extends ConsumerState<HomePage> {
  Timer? _midnightTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final vocabState = ref.read(vocabSessionProvider);
      final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
      final cache = vocabState.value;
      final hasTodayCache = cache != null && cache.sessionDateKey == todayKey;
      if (!hasTodayCache) {
        ref.read(vocabSessionProvider.notifier).loadIfNeeded('daily-vocab');
      }
      _scheduleMidnightTimer();
    });
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
    ref.invalidate(homePageDataProvider);
    _scheduleMidnightTimer();
  }

  @override
  void dispose() {
    _midnightTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final asyncData = ref.watch(homePageDataProvider);
    final vocabSession = ref.watch(vocabSessionProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: asyncData.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: AppColors.blueHighlighted),
          ),
          error: (err, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Something went wrong',
                    style: TextStyle(color: Colors.white, fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    err.toString(),
                    style: TextStyle(color: AppColors.navbarInactive, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => ref.invalidate(homePageDataProvider),
                    style: FilledButton.styleFrom(backgroundColor: AppColors.button),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (data) => _buildContent(context, data, vocabSession),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    HomePageData data,
    AsyncValue<VocabSessionState> vocabSession,
  ) {
    final todayKey = DateTime.now().toLocal().toIso8601String().substring(0, 10);
    final cache = vocabSession.value;
    final hasTodayCache = cache != null && cache.sessionDateKey == todayKey;
    final totalCount = hasTodayCache ? cache.session.totalQuestionCount : 0;
    final completedCount = hasTodayCache ? cache.completedQuestionCount : 0;

    final isLoading = vocabSession.isLoading;
    final hasTodayAndEmpty = hasTodayCache && cache.questions.isEmpty;

    final todoAssignments = <HomeAssignment>[];
    for (final a in data.assignments) {
      if (a.id == 'daily-vocab' || a.type == 'VOCAB') {
        continue;
      }
      todoAssignments.add(a);
    }

    final showVocabCompleted = !isLoading && hasTodayAndEmpty;
    final showVocabAssignment = !showVocabCompleted;

    if (showVocabAssignment) {
      todoAssignments.insert(
        0,
        HomeAssignment(
          id: 'daily-vocab',
          type: 'VOCAB',
          teacher: '',
          dueDate: 'Today',
          totalQuestionCount: totalCount,
          completedQuestionCount: completedCount,
          buttonLabel: completedCount > 0 ? 'Continue' : 'Start',
        ),
      );
    }

    final completed = <HomeCompletion>[
      ...data.completed,
      if (showVocabCompleted)
        const HomeCompletion(
          type: 'VOCAB',
          teacher: '',
          dueDate: '',
          totalQuestionCount: 0,
          completedAt: '',
          subtitle: '',
        ),
    ];

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
                      buttonLabel: a.buttonLabel,
                      onTap: () => context.go('/assignment/${a.type.toLowerCase().replaceAll(' ', '_')}/${a.id}'),
                    ))
                .toList(),
          ),
        ),
        SliverToBoxAdapter(child: _buildCompletedSection(context, completed)),
      ],
    );
  }

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

  void _onContinueCompleted(BuildContext context, String type) {
    switch (type) {
      case 'VOCAB':
        ref.read(vocabSessionProvider.notifier).clear();
        context.go('/assignment/vocab/daily-vocab');
        break;
      case 'TRANSLATION':
        context.go('/assignment/translation/daily-translation');
        break;
      case 'PRODUCTION':
        context.go('/assignment/production/daily-production');
        break;
      default:
        break;
    }
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
              onContinue: () => _onContinueCompleted(context, c.type),
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
    required this.buttonLabel,
    required this.onTap,
  });

  final String type;
  final String teacher;
  final String due;
  final int completedQuestionCount;
  final int totalQuestionCount;
  final String buttonLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final progressFraction = totalQuestionCount > 0 ? completedQuestionCount / totalQuestionCount : 0.0;
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
                '$completedQuestionCount / $totalQuestionCount questions',
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
