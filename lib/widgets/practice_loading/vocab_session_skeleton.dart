import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../theme/app_colors.dart';
import 'skeleton_primitives.dart';

class VocabSessionSkeleton extends StatelessWidget {
  const VocabSessionSkeleton({super.key});

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
                  const Expanded(
                    child: Column(
                      children: [
                        Text(
                          'VOCABULARY MODE',
                          style: TextStyle(
                            color: AppColors.blueHighlighted,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0.5,
                          ),
                        ),
                        Text(
                          'Vocabulary practice',
                          style: TextStyle(
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
              const SkeletonBox(
                height: 6,
                radius: 4,
                color: AppColors.cardBorder,
              ),
            ],
          ),
        ),
        const Expanded(
          child: Center(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: SkeletonCard(
                height: 260,
                radius: 16,
                color: AppColors.vocabCardBackground,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SkeletonBox(width: 160, height: 28, radius: 8),
                    SizedBox(height: 18),
                    SkeletonBox(width: 120, height: 18, radius: 6),
                  ],
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Row(
            children: List.generate(
              4,
              (index) => const Expanded(
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 4),
                  child: SkeletonCard(
                    height: 60,
                    radius: 12,
                    color: AppColors.button,
                    child: Center(
                      child: SkeletonBox(width: 34, height: 18, radius: 6),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
