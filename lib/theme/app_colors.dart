import 'package:flutter/material.dart';

/// Centralized app color palette. Use these instead of hardcoding hex values.
class AppColors {
  AppColors._();

  static const Color background = Color(0xFF101622);
  static const Color button = Color(0xFF135BEC);
  static const Color cardBackground = Color(0xFF0F172A);
  static const Color cardBorder = Color(0xFF1E293B);
  static const Color navbarBackground = Color(0xFF0F172A);
  static const Color blueHighlighted = Color(0xFF135BEC);
  static const Color completedTabsBackground = Color(0xFF101622);
  static const Color completedTabsBorder = Color(0xFF1B2537);

  /// Navbar text/icon when not selected.
  static const Color navbarInactive = Color(0xFF8E8E93);

  /// Green for scores and completed checkmarks.
  static const Color success = Color(0xFF34C759);

  /// Accent for assignment type labels (e.g. VOCAB, READING VOCAB).
  static const Color assignmentTypeAccent = Color(0xFFE07C5A);
}
