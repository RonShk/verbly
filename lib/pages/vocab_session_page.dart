import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../constants/demo_user.dart';
import '../models/vocab_session_models.dart';
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

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(vocabSessionProvider(widget.assignmentId));

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
                    onPressed: () =>
                        ref.invalidate(vocabSessionProvider(widget.assignmentId)),
                    style: FilledButton.styleFrom(
                        backgroundColor: AppColors.button),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (session) {
            final total = session.totalQuestionCount;
            final questions = session.questions;
            final currentCardIndex = session.completedQuestionCount;
            final displayIndex = currentCardIndex + 1;

            if (questions.isEmpty || currentCardIndex >= questions.length) {
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
                      onPressed: () => context.go('/home'),
                      style: FilledButton.styleFrom(
                          backgroundColor: AppColors.button),
                      child: const Text('Back to Home'),
                    ),
                  ],
                ),
              );
            }

            final q = questions[currentCardIndex];

            return Column(
              children: [
                _buildHeader(context, session.assignmentTitle, displayIndex, total),
                Expanded(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: _buildCard(context, session, q),
                    ),
                  ),
                ),
                if (_isFlipped)
                  _buildNextCardButton(context, currentCardIndex),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildHeader(
      BuildContext context, String title, int current, int total) {
    final progress = total > 0 ? current / total : 0.0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.close),
                color: Colors.white.withValues(alpha: 0.9),
                onPressed: () => context.go('/home'),
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
              Text(
                'PROGRESS',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Spacer(),
              Text(
                '$current of $total',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 12,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: AppColors.cardBorder,
              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.button),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(
      BuildContext context, VocabSessionData session, VocabQuestion q) {
    return GestureDetector(
      onTap: () => setState(() => _isFlipped = !_isFlipped),
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
              _isFlipped ? 'ENGLISH TRANSLATION' : 'SPANISH',
              style: TextStyle(
                color: AppColors.navbarInactive,
                fontSize: 11,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _isFlipped ? q.englishWord : q.learningLanguageWord,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Icon(
              _isFlipped ? Icons.rotate_right : Icons.touch_app,
              size: 18,
              color: AppColors.navbarInactive,
            ),
            const SizedBox(height: 2),
            Text(
              _isFlipped ? 'TAP TO FLIP BACK' : 'TAP TO FLIP',
              style: TextStyle(
                color: AppColors.navbarInactive,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNextCardButton(BuildContext context, int currentCardIndex) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
      child: SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: () async {
            final result = await recordVocabResponse(
              assignmentId: widget.assignmentId,
              userId: demoUserId,
              questionIndex: currentCardIndex,
            );
            if (result.assignmentCompleted && mounted) {
              context.go('/home');
              return;
            }
            ref.invalidate(vocabSessionProvider(widget.assignmentId));
            setState(() => _isFlipped = false);
          },
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.button,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('Next Card', style: TextStyle(fontSize: 16)),
              SizedBox(width: 8),
              Icon(Icons.arrow_forward, size: 18),
            ],
          ),
        ),
      ),
    );
  }
}
