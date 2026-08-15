import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../theme/app_colors.dart';
import 'skeleton_primitives.dart';

class PracticeSessionSkeleton extends StatelessWidget {
  const PracticeSessionSkeleton({
    super.key,
    required this.modeLabel,
    required this.title,
    this.currentProgress = 0,
    this.totalProgress = 0,
    this.cumulativeOffset = 0,
  });

  final String modeLabel;
  final String title;
  final int currentProgress;
  final int totalProgress;
  final int cumulativeOffset;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
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
                          modeLabel,
                          style: const TextStyle(
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
                    '${cumulativeOffset + currentProgress} / $totalProgress',
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
                  value: totalProgress > 0
                      ? (cumulativeOffset > 0
                            ? 1
                            : (currentProgress / totalProgress).clamp(0, 1))
                      : 0,
                  minHeight: 6,
                  backgroundColor: AppColors.cardBorder,
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    AppColors.button,
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              children: [
                const SizedBox(height: 8),
                SkeletonCard(
                  height: 180,
                  radius: 16,
                  color: AppColors.vocabCardBackground,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SkeletonBox(width: 120, height: 12, radius: 6),
                      const SizedBox(height: 22),
                      const SkeletonBox(width: 230, height: 22, radius: 8),
                      const SizedBox(height: 10),
                      const SkeletonBox(width: 180, height: 22, radius: 8),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Container(
                  width: double.infinity,
                  height: 96,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: AppColors.cardBackground,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.cardBorder),
                  ),
                  alignment: Alignment.topLeft,
                  child: const Text(
                    'Type your response here...',
                    style: TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 15,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                SizedBox(
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
                        Text('Submit Answer', style: TextStyle(fontSize: 16)),
                        SizedBox(width: 8),
                        Icon(Icons.arrow_forward, size: 18),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const TextButton(
                  onPressed: null,
                  child: Text(
                    "I DON'T KNOW THIS ONE",
                    style: TextStyle(
                      color: AppColors.navbarInactive,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
