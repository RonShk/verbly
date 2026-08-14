import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../pages/student_onboarding_page.dart';
import '../providers/user_session_provider.dart';
import '../theme/app_colors.dart';

/// Wraps the current route in a scaffold with a bottom nav bar (Home, Profile).
class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.currentPath, required this.child});

  final String currentPath;
  final Widget child;

  static const _navItems = [
    (
      path: '/home',
      label: 'HOME',
      icon: Icons.home_outlined,
      iconSelected: Icons.home,
    ),
    (
      path: '/profile',
      label: 'PROFILE',
      icon: Icons.person_outline,
      iconSelected: Icons.person,
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connection = ref.watch(studentConnectionProvider);
    final profile = ref.watch(studentProfileProvider);
    return connection.when(
      loading: () => const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(child: CircularProgressIndicator()),
      ),
      error: (error, _) => StudentConnectionPage(
        errorMessage: 'Please check your connection and try again.',
      ),
      data: (status) {
        final currentProfile = profile.value;
        if (currentProfile != null && currentProfile.wasRemoved) {
          return const StudentConnectionPage(removed: true);
        }
        if (status == StudentConnectionStatus.noInvitation) {
          return const StudentConnectionPage();
        }
        return _buildShell(context, currentPath, child);
      },
    );
  }

  Widget _buildShell(BuildContext context, String currentPath, Widget child) {
    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        color: AppColors.navbarBackground,
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final item in _navItems)
                  _NavItem(
                    path: item.path,
                    label: item.label,
                    icon: item.icon,
                    iconSelected: item.iconSelected,
                    isSelected: currentPath == item.path,
                    onTap: () => context.go(item.path),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.path,
    required this.label,
    required this.icon,
    required this.iconSelected,
    required this.isSelected,
    required this.onTap,
  });

  final String path;
  final String label;
  final IconData icon;
  final IconData iconSelected;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = isSelected
        ? AppColors.blueHighlighted
        : AppColors.navbarInactive;
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(isSelected ? iconSelected : icon, color: color, size: 26),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (isSelected)
            Container(
              margin: const EdgeInsets.only(top: 4),
              height: 2,
              width: 24,
              decoration: const BoxDecoration(
                color: AppColors.blueHighlighted,
                borderRadius: BorderRadius.all(Radius.circular(1)),
              ),
            ),
        ],
      ),
    );
  }
}
