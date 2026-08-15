import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';
import 'skeleton_primitives.dart';

class PracticeFeedbackSkeleton extends StatelessWidget {
  const PracticeFeedbackSkeleton({
    super.key,
    required this.isSkipped,
    this.targetPhrase,
    this.submittedAnswer,
  });

  final bool isSkipped;
  final String? targetPhrase;
  final String? submittedAnswer;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 12),
                if (!isSkipped) ...[
                  const Align(
                    child: SkeletonBox(width: 120, height: 72, radius: 36),
                  ),
                  const SizedBox(height: 20),
                  FeedbackCard(
                    label: 'YOUR RESPONSE',
                    labelColor: AppColors.navbarInactive,
                    height: 100,
                    content: submittedAnswer,
                  ),
                ] else ...[
                  FeedbackCard(
                    label: 'TARGET PHRASE',
                    labelColor: AppColors.blueHighlighted,
                    icon: Icons.translate,
                    height: 120,
                    content: targetPhrase,
                    largeContent: true,
                  ),
                ],
                const SizedBox(height: 16),
                const FeedbackCard(
                  label: 'CORRECT TRANSLATION',
                  labelColor: AppColors.success,
                  icon: Icons.check_circle_outline,
                  height: 100,
                ),
                const SizedBox(height: 16),
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
                      color: AppColors.blueHighlighted.withValues(alpha: 0.3),
                    ),
                  ),
                  child: const Row(
                    children: [
                      SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.assignmentTypeAccent,
                        ),
                      ),
                      SizedBox(width: 12),
                      Text(
                        'Verbly is thinking…',
                        style: TextStyle(
                          color: AppColors.navbarInactive,
                          fontSize: 13,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: null,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.button,
                disabledBackgroundColor: AppColors.button,
                disabledForegroundColor: Colors.white,
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
        ),
      ],
    );
  }
}
