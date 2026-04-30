import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../constants/demo_user.dart';
import '../constants/foreign_characters.dart';
import '../models/production_session_models.dart';
import '../providers/production_session_provider.dart';
import '../services/production_session_api_calls.dart';
import '../theme/app_colors.dart';

class ProductionSessionPage extends ConsumerStatefulWidget {
  const ProductionSessionPage({super.key, required this.assignmentId});

  final String assignmentId;

  @override
  ConsumerState<ProductionSessionPage> createState() => _ProductionSessionPageState();
}

class _ProductionSessionPageState
    extends ConsumerState<ProductionSessionPage> {
  final _answerController = TextEditingController();
  final _answerFocusNode = FocusNode();
  bool _isSubmitting = false;
  ProductionEvaluationResult? _evaluationResult;
  String? _submittedAnswer;

  void _focusAnswerInput() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_answerFocusNode.canRequestFocus) {
        _answerFocusNode.requestFocus();
      }
    });
  }

  @override
  void dispose() {
    _answerController.dispose();
    _answerFocusNode.dispose();
    super.dispose();
  }

  /// Invalidate Home's cached Production status so the returning Home page
  /// re-queries placement (e.g. moved from Todo → Completed).
  void _invalidateHome() {
    ref.read(productionDailyProvider.notifier).clear();
  }

  /// Re-fetch the hydrated session for the current `assignmentId`. Backend is
  /// idempotent, so this does NOT regenerate questions.
  void _refreshSession() {
    ref.invalidate(productionStartSessionProvider(widget.assignmentId));
  }

  @override
  Widget build(BuildContext context) {
    final sessionAsync = ref.watch(productionStartSessionProvider(widget.assignmentId));

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: sessionAsync.when(
          loading: () => _buildLoadingView(context),
          error: (err, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Text(
                    'Something went wrong',
                    style: TextStyle(color: Colors.white, fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    err.toString(),
                    style: const TextStyle(
                        color: AppColors.navbarInactive, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: _refreshSession,
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

            if (questions.isEmpty || currentCardIndex >= questions.length) {
              return _buildCompletedView(context);
            }

            final q = questions[currentCardIndex];

            if (_evaluationResult != null) {
              return _buildFeedbackView(
                context,
                q,
                _evaluationResult!,
                _submittedAnswer ?? '',
                currentCardIndex,
                total,
              );
            }

            _focusAnswerInput();
            return _buildQuestionView(
              context,
              session,
              q,
              currentCardIndex,
              total,
            );
          },
        ),
      ),
    );
  }

  /// Loading view shown while AI generation is in progress on the backend.
  /// Includes an X close button so the user can return to Home; the Cloud
  /// Function continues running and persists its result regardless.
  Widget _buildLoadingView(BuildContext context) {
    return Stack(
      children: [
        Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const CircularProgressIndicator(color: AppColors.blueHighlighted),
              const SizedBox(height: 24),
              const Text(
                'We are generating your assignments.\nPlease wait — this may take 5–10 seconds.',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
        Positioned(
          top: 8,
          left: 8,
          child: IconButton(
            icon: const Icon(Icons.close),
            color: Colors.white.withValues(alpha: 0.9),
            onPressed: () {
              _invalidateHome();
              context.go('/home');
            },
          ),
        ),
      ],
    );
  }

  Widget _buildCompletedView(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text(
            'All done!',
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              _invalidateHome();
              context.go('/home');
            },
            style:
                FilledButton.styleFrom(backgroundColor: AppColors.button),
            child: const Text('Back to Home'),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // QUESTION VIEW (left screen in design)
  // ---------------------------------------------------------------------------

  Widget _buildQuestionView(
    BuildContext context,
    ProductionSessionData session,
    ProductionQuestion q,
    int currentCardIndex,
    int total,
  ) {
    // Cumulative label rule (matches Vocab/Translation/Home):
    //  - Wave 1 (offset == 0): "on card N" semantic so first card reads
    //    "1/total".
    //  - Wave 2+ (offset > 0): straight cumulative so a freshly-started
    //    wave reads "total/total" and bumps to "(total+1)/total" on first
    //    submit.
    final isContinueReviewWave = session.cumulativeOffsetQuestionCount > 0;
    final displayIndex = isContinueReviewWave ? session.cumulativeOffsetQuestionCount + currentCardIndex : currentCardIndex + 1;

    return Column(
      children: [
        _buildQuestionHeader(
          context,
          session.assignmentTitle,
          displayIndex,
          total,
          isContinueReviewWave,
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),
                _buildPromptCard(q),
                const SizedBox(height: 20),
                _buildAnswerInput(),
                const SizedBox(height: 24),
                _buildSubmitButton(currentCardIndex, q),
                const SizedBox(height: 12),
                _buildSkipButton(currentCardIndex),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildQuestionHeader(
    BuildContext context,
    String title,
    int current,
    int total,
    bool isContinueReviewWave,
  ) {
    // Bar rule: post–continue-review waves are always full; first wave fills
    // proportionally to in-wave position.
    final progress = isContinueReviewWave ? 1.0 : (total > 0 ? (current / total).clamp(0.0, 1.0) : 0.0);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
      child: Column(
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.close),
                color: Colors.white.withValues(alpha: 0.9),
                onPressed: () {
                  _invalidateHome();
                  context.go('/home');
                },
              ),
              Expanded(
                child: Column(
                  children: [
                    const Text(
                      'PRODUCTION MODE',
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
              const Text(
                'SESSION PROGRESS',
                style: TextStyle(
                  color: AppColors.navbarInactive,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Spacer(),
              Text(
                '$current / $total',
                style: const TextStyle(
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
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppColors.button),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPromptCard(ProductionQuestion q) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.vocabCardBackground,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'TRANSLATE TO SPANISH',
                style: TextStyle(
                  color: AppColors.blueHighlighted,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            q.sentenceInNativeLanguage,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
              height: 1.3,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildAnswerInput() {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.cardBackground,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        children: [
          TextField(
            controller: _answerController,
            focusNode: _answerFocusNode,
            autofocus: true,
            autocorrect: false,
            enableSuggestions: false,
            spellCheckConfiguration: SpellCheckConfiguration.disabled(),
            enableIMEPersonalizedLearning: false,
            onChanged: (_) => setState(() {}),
            maxLines: 3,
            minLines: 3,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: InputDecoration(
              hintText: 'Type your response here...',
              hintStyle: TextStyle(
                color: AppColors.navbarInactive.withValues(alpha: 0.6),
                fontSize: 15,
              ),
              contentPadding: const EdgeInsets.all(16),
              border: InputBorder.none,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSubmitButton(int currentCardIndex, ProductionQuestion q) {
    final hasText = _answerController.text.trim().isNotEmpty;
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: hasText && !_isSubmitting
            ? () => _submitAnswer(currentCardIndex)
            : null,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.button,
          disabledBackgroundColor: AppColors.button.withValues(alpha: 0.4),
          padding: const EdgeInsets.symmetric(vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: _isSubmitting
            ? const SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Submit Answer', style: TextStyle(fontSize: 16)),
                  SizedBox(width: 8),
                  Icon(Icons.arrow_forward, size: 18),
                ],
              ),
      ),
    );
  }

  Widget _buildSkipButton(int currentCardIndex) {
    return Center(
      child: TextButton(
        onPressed: _isSubmitting ? null : () => _skipQuestion(currentCardIndex),
        child: const Text(
          "I DON'T KNOW THIS ONE",
          style: TextStyle(
            color: AppColors.navbarInactive,
            fontSize: 13,
            fontWeight: FontWeight.w500,
            letterSpacing: 0.3,
          ),
        ),
      ),
    );
  }

  Future<void> _submitAnswer(int questionIndex) async {
    final answer = _answerController.text.trim();
    if (answer.isEmpty) return;

    setState(() => _isSubmitting = true);

    try {
      final result = await evaluateProductionResponse(
        assignmentId: widget.assignmentId,
        userId: demoUserId,
        questionIndex: questionIndex,
        studentAnswer: answer,
        useForeignCharacters: kUseForeignCharacters,
      );

      if (!mounted) return;

      setState(() {
        _evaluationResult = result;
        _submittedAnswer = answer;
        _isSubmitting = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  Future<void> _skipQuestion(int questionIndex) async {
    setState(() => _isSubmitting = true);

    try {
      final result = await evaluateProductionResponse(
        assignmentId: widget.assignmentId,
        userId: demoUserId,
        questionIndex: questionIndex,
        studentAnswer: '(skipped)',
        useForeignCharacters: kUseForeignCharacters,
      );

      if (!mounted) return;

      if (result.assignmentCompleted) {
        _invalidateHome();
        context.go('/home');
        return;
      }

      _refreshSession();
      _resetState();
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: AppColors.danger,
        ),
      );
    }
  }

  void _resetState() {
    setState(() {
      _answerController.clear();
      _isSubmitting = false;
      _evaluationResult = null;
      _submittedAnswer = null;
    });
    _focusAnswerInput();
  }

  // ---------------------------------------------------------------------------
  // FEEDBACK VIEW (right screen in design)
  // ---------------------------------------------------------------------------

  Widget _buildFeedbackView(
    BuildContext context,
    ProductionQuestion q,
    ProductionEvaluationResult result,
    String submittedAnswer,
    int currentCardIndex,
    int total,
  ) {
    return Column(
      children: [
        _buildFeedbackHeader(context),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 16),
                _buildScoreRing(result.score),
                const SizedBox(height: 16),
                Center(
                  child: Text(
                    result.feedback,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Center(
                  child: Text(
                    _feedbackSubtitle(result.score),
                    style: const TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 13,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
                const SizedBox(height: 24),
                _buildResponseSection(submittedAnswer),
                const SizedBox(height: 20),
                _buildCorrectedSection(result),
                const SizedBox(height: 20),
                if (result.explanations.isNotEmpty) ...[
                  _buildExplanationSection(result.explanations),
                  const SizedBox(height: 24),
                ],
              ],
            ),
          ),
        ),
        _buildFeedbackBottomBar(context, result, currentCardIndex),
      ],
    );
  }

  Widget _buildFeedbackHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.close),
            color: Colors.white.withValues(alpha: 0.9),
            onPressed: () {
              _invalidateHome();
              context.go('/home');
            },
          ),
          const Expanded(
            child: Center(
              child: Text(
                'AI Feedback',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 48),
        ],
      ),
    );
  }

  Widget _buildScoreRing(int score) {
    final fraction = score / 100;
    final color = score >= 80 ? AppColors.success : score >= 50 ? AppColors.assignmentTypeAccent : AppColors.danger;

    return Center(
      child: SizedBox(
        width: 100,
        height: 100,
        child: CustomPaint(
          painter: _ScoreRingPainter(fraction: fraction, color: color),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  '$score',
                  style: TextStyle(
                    color: color,
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  'SCORE',
                  style: TextStyle(
                    color: color.withValues(alpha: 0.7),
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _feedbackSubtitle(int score) {
    if (score >= 90) return 'Your grammatical accuracy is excellent.';
    if (score >= 70) return 'Your grammatical accuracy is improving.';
    if (score >= 50) return 'Keep working on your sentence structure.';
    return 'Review the corrections and try again next time.';
  }

  Widget _buildResponseSection(String submittedAnswer) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'YOUR RESPONSE',
          style: TextStyle(
            color: AppColors.navbarInactive,
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: AppColors.blueHighlighted.withValues(alpha: 0.3)),
          ),
          child: Text(
            submittedAnswer,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildCorrectedSection(ProductionEvaluationResult result) {
    final segments = result.correctedVersionSegments;
    final hasHighlights = segments != null && segments.isNotEmpty && segments.any((s) => s.highlight != 'none');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'CORRECTED VERSION',
              style: TextStyle(
                color: AppColors.navbarInactive,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.blueHighlighted.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Text(
                'AI IMPROVED',
                style: TextStyle(
                  color: AppColors.blueHighlighted,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: AppColors.blueHighlighted.withValues(alpha: 0.3)),
          ),
          child: hasHighlights
              ? RichText(
                  text: TextSpan(
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      height: 1.4,
                    ),
                    children: [
                      ...segments.map((seg) {
                        Color color = Colors.white;
                        if (seg.highlight == 'wrong') {
                          color = AppColors.danger;
                        } else if (seg.highlight == 'correct') {
                          color = AppColors.success;
                        }
                        return TextSpan(
                          text: seg.text,
                          style: TextStyle(
                            color: color,
                            fontSize: 14,
                            height: 1.4,
                            decoration: seg.highlight == 'correct'
                                ? TextDecoration.underline
                                : null,
                            decorationColor: seg.highlight == 'correct'
                                ? AppColors.success
                                : null,
                          ),
                        );
                      }),
                    ],
                  ),
                )
              : Text(
                  result.correctedVersion,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildExplanationSection(List<ProductionExplanation> explanations) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'EXPLANATION',
          style: TextStyle(
            color: AppColors.navbarInactive,
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.cardBackground,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: AppColors.blueHighlighted.withValues(alpha: 0.3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: explanations.map((exp) {
              return Padding(
                padding: EdgeInsets.only(
                  bottom: exp == explanations.last ? 0 : 14,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.assignmentTypeAccent,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            exp.category.toUpperCase(),
                            style: const TextStyle(
                              color: AppColors.assignmentTypeAccent,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            exp.detail,
                            style: const TextStyle(
                              color: AppColors.navbarInactive,
                              fontSize: 13,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  Widget _buildFeedbackBottomBar(
    BuildContext context,
    ProductionEvaluationResult result,
    int currentCardIndex,
  ) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: () {
            if (result.assignmentCompleted) {
              _invalidateHome();
              context.go('/home');
              return;
            }
            _refreshSession();
            _resetState();
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

/// Draws a circular score ring.
class _ScoreRingPainter extends CustomPainter {
  _ScoreRingPainter({required this.fraction, required this.color});

  final double fraction;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width / 2) - 5;

    final bgPaint = Paint()
      ..color = color.withValues(alpha: 0.15)
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke;
    canvas.drawCircle(center, radius, bgPaint);

    final fgPaint = Paint()
      ..color = color
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final sweepAngle = 2 * pi * fraction;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -pi / 2,
      sweepAngle,
      false,
      fgPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _ScoreRingPainter oldDelegate) =>
      oldDelegate.fraction != fraction || oldDelegate.color != color;
}
