import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Wraps the current route in a scaffold with a bottom nav bar (Home, Assignments, Profile).
class MainShell extends StatelessWidget {
  const MainShell({super.key, required this.currentPath, required this.child});

  final String currentPath;
  final Widget child;

  static const _navItems = [
    (path: '/home', label: 'HOME', icon: Icons.home_outlined, iconSelected: Icons.home),
    (path: '/assignments', label: 'ASSIGNMENTS', icon: Icons.assignment_outlined, iconSelected: Icons.assignment),
    (path: '/profile', label: 'PROFILE', icon: Icons.person_outline, iconSelected: Icons.person),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        color: const Color(0xFF1C1C1E),
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
    final color = isSelected ? const Color(0xFF0A84FF) : const Color(0xFF8E8E93);
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
        ],
      ),
    );
  }
}
