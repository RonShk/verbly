import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    required this.height,
    required this.radius,
    this.color,
  });

  final double? width;
  final double height;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return AnimatedShimmer(
      child: Container(
        width: width ?? double.infinity,
        height: height,
        decoration: BoxDecoration(
          color: color ?? const Color(0xFF334155),
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );
  }
}

class SkeletonCard extends StatelessWidget {
  const SkeletonCard({
    super.key,
    required this.height,
    required this.radius,
    required this.color,
    this.border,
    this.child,
  });

  final double height;
  final double radius;
  final Color color;
  final Color? border;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: height,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        border: border == null ? null : Border.all(color: border!),
      ),
      child: child,
    );
  }
}

class AnimatedShimmer extends StatefulWidget {
  const AnimatedShimmer({super.key, required this.child});

  final Widget child;

  @override
  State<AnimatedShimmer> createState() => _AnimatedShimmerState();
}

class _AnimatedShimmerState extends State<AnimatedShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) {
        final progress = _controller.value;
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (bounds) {
            final start = -2.0 + (progress * 4.0);
            return LinearGradient(
              begin: Alignment(start, 0),
              end: Alignment(start + 1.2, 0),
              colors: const [
                Color(0xFF334155),
                Color(0xFF52627A),
                Color(0xFF334155),
              ],
              stops: const [0.2, 0.5, 0.8],
            ).createShader(bounds);
          },
          child: child,
        );
      },
    );
  }
}

class FeedbackCard extends StatelessWidget {
  const FeedbackCard({
    super.key,
    required this.label,
    required this.labelColor,
    required this.height,
    this.icon,
    this.content,
    this.largeContent = false,
  });

  final String label;
  final Color labelColor;
  final IconData? icon;
  final double height;
  final String? content;
  final bool largeContent;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (icon != null) Icon(icon, color: labelColor, size: 18),
            if (icon != null) const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: labelColor,
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (content != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.cardBackground,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.cardBorder),
            ),
            child: Text(
              content!,
              style: TextStyle(
                color: Colors.white,
                fontSize: largeContent ? 22 : 14,
                fontWeight: largeContent ? FontWeight.bold : FontWeight.normal,
                height: 1.4,
              ),
            ),
          )
        else
          SkeletonCard(
            height: height,
            radius: 10,
            color: AppColors.cardBackground,
            border: AppColors.cardBorder,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SkeletonBox(height: 16, radius: 6),
                  const SizedBox(height: 10),
                  const SkeletonBox(width: 220, height: 16, radius: 6),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
