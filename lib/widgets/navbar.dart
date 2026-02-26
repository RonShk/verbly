import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';

/// Wraps the current route in a scaffold with a bottom nav bar (Home, Profile).
class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.currentPath, required this.child});

  final String currentPath;
  final Widget child;

  static const _navItems = [
    (path: '/home', label: 'HOME', icon: Icons.home_outlined, iconSelected: Icons.home),
    (path: '/profile', label: 'PROFILE', icon: Icons.person_outline, iconSelected: Icons.person),
  ];

  @override
  Widget build(BuildContext context) {
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
                for (final item in _navItems) _NavItem(
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
    final color = isSelected ? AppColors.blueHighlighted : AppColors.navbarInactive;
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(isSelected ? iconSelected : icon, color: color, size: 26),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w500),
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
