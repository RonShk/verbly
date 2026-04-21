import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../constants/demo_user.dart';
import '../models/vocab_session_models.dart';
import '../providers/home_page_provider.dart';
import '../providers/vocab_session_provider.dart';
import '../services/vocab_session_api_calls.dart';
import '../theme/app_colors.dart';

class VocabSessionPage extends ConsumerStatefulWidget {
  const VocabSessionPage({super.key, required this.assignmentId});

  final String assignmentId;

  @override
  ConsumerState<VocabSessionPage> createState() => _VocabSessionPageState();
}

class _VocabSessionPageState extends ConsumerState<VocabSessionPage> {
  bool _isFlipped = false;
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(vocabSessionProvider.notifier).loadIfNeeded(widget.assignmentId);
    });
  }

  @override
  void didUpdateWidget(covariant VocabSessionPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.assignmentId != oldWidget.assignmentId) {
      _currentIndex = 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ref.read(vocabSessionProvider.notifier).clear();
        ref.read(vocabSessionProvider.notifier).loadIfNeeded(widget.assignmentId);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(vocabSessionProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: sessionAsync.when(
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
                    style: TextStyle(
                        color: AppColors.navbarInactive, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () {
                      ref.read(vocabSessionProvider.notifier).clear();
                    },
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.button),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (state) {
            final questions = state.questions;
            final session = state.session;
            if (_currentIndex >= questions.length && questions.isNotEmpty) {
              _currentIndex = 0;
            }
            final currentIndex = _currentIndex;

            if (questions.isEmpty || currentIndex >= questions.length) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      'All done!',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {
                        ref.invalidate(homePageDataProvider);
                        context.go('/home');
                      },
                      style: FilledButton.styleFrom(
                          backgroundColor: AppColors.button),
                      child: const Text('Back to Home'),
                    ),
                  ],
                ),
              );
            }

            final q = questions[currentIndex];
            final total = session.totalQuestionCount;
            final currentPosition = state.completedQuestionCount + 1;

            return Column(
              children: [
                _buildHeader(context, session.assignmentTitle, currentPosition, total),
                Expanded(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: _buildCard(context, session, q),
                    ),
                  ),
                ),
                if (_isFlipped)
                  _buildRatingButtons(context, session, q, currentIndex),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildHeader(
    BuildContext context,
    String title,
    int currentPosition,
    int totalCount,
  ) {
    final progress = totalCount > 0 ? (currentPosition / totalCount).clamp(0.0, 1.0) : 0.0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.close),
                color: Colors.white.withValues(alpha: 0.9),
                onPressed: () {
                  ref.invalidate(homePageDataProvider);
                  context.go('/home');
                },
              ),
              Expanded(
                child: Column(
                  children: [
                    Text(
                      'ACADEMIC PRACTICE',
                      style: TextStyle(
                        color: AppColors.blueHighlighted,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 0.5,
                      ),
                    ),
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 48),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 6,
                    backgroundColor: AppColors.cardBorder,
                    valueColor: const AlwaysStoppedAnimation<Color>(AppColors.button),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                '$currentPosition / $totalCount',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCard(
      BuildContext context, VocabSessionData session, VocabQuestion q) {
    return GestureDetector(
      onTap: _isFlipped ? null : () => setState(() => _isFlipped = true),
      child: Container(
        width: double.infinity,
        height: MediaQuery.of(context).size.height * 0.55,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
        decoration: BoxDecoration(
          color: AppColors.vocabCardBackground,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.blueHighlighted.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                'VOCAB',
                style: TextStyle(
                  color: AppColors.blueHighlighted,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'SPANISH',
              style: TextStyle(
                color: AppColors.navbarInactive,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              q.learningLanguageWord,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            if (_isFlipped) ...[
              const SizedBox(height: 24),
              Divider(color: AppColors.cardBorder, thickness: 1),
              const SizedBox(height: 24),
              Text(
                'ENGLISH TRANSLATION',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                q.englishWord,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
            ] else ...[
              const SizedBox(height: 12),
              const Icon(Icons.touch_app, size: 18, color: AppColors.navbarInactive),
              const SizedBox(height: 2),
              Text(
                'TAP TO FLIP',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 11,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildRatingButtons(
    BuildContext context,
    VocabSessionData session,
    VocabQuestion q,
    int currentCardIndex,
  ) {
    final ratings = <_RatingOption>[
      _RatingOption(1, 'Again', Icons.refresh, const Color(0xFFE53935)),
      _RatingOption(2, 'Hard', Icons.fitness_center, const Color(0xFFFB8C00)),
      _RatingOption(3, 'Good', Icons.thumb_up, const Color(0xFF43A047)),
      _RatingOption(4, 'Easy', Icons.bolt, const Color(0xFF1E88E5)),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'How well did you know it?',
            style: TextStyle(
              color: AppColors.navbarInactive,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: ratings.map((r) {
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: FilledButton(
                    onPressed: () => _onRating(context, session, q, currentCardIndex, r.rating),
                    style: FilledButton.styleFrom(
                      backgroundColor: r.color,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(r.icon, size: 20, color: Colors.white),
                        const SizedBox(height: 4),
                        Text(r.label, style: const TextStyle(fontSize: 11, color: Colors.white)),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }

  Future<void> _onRating(
    BuildContext context,
    VocabSessionData session,
    VocabQuestion q,
    int currentCardIndex,
    int rating,
  ) async {
    final state = ref.read(vocabSessionProvider).value;
    final result = await recordVocabResponse(
      userId: demoUserId,
      vocabCardId: q.vocabCardId,
      rating: rating,
      totalQuestionCount: state?.session.totalQuestionCount ?? 0,
      completedQuestionCount: (state?.completedQuestionCount ?? 0) + 1,
    );
    if (!context.mounted) return;
    ref.read(vocabSessionProvider.notifier).applyRating(
      result.stillDueToday,
      currentCardIndex,
      q,
    );
    setState(() {
      _isFlipped = false;
      // _currentIndex stays the same: next card is now at this index (after remove/move)
    });
  }
}

class _RatingOption {
  const _RatingOption(this.rating, this.label, this.icon, this.color);
  final int rating;
  final String label;
  final IconData icon;
  final Color color;
}
