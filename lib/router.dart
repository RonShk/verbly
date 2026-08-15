import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'pages/home_page.dart';
import 'pages/continue_review_loading_page.dart';
import 'pages/login_page.dart';
import 'pages/profile_page.dart';
import 'pages/student_onboarding_page.dart';
import 'pages/production_session_page.dart';
import 'pages/translation_session_page.dart';
import 'pages/vocab_session_page.dart';
import 'providers/user_session_provider.dart';
import 'services/auth/user_session.dart';
import 'widgets/navbar.dart';

/// Single long-lived [GoRouter] for the app.
///
/// Listens to the auth-state stream via `refreshListenable` so that whenever
/// the user signs in or out, the redirect logic re-runs and pushes them to
/// the appropriate screen. Reads `FirebaseAuth.currentUser` directly inside
/// `redirect` (rather than capturing it from Riverpod) so the value is always
/// current at the moment redirect fires.
final goRouterProvider = Provider<GoRouter>((ref) {
  final refreshListenable = ref.watch(routerAuthRefreshProvider);

  return GoRouter(
    initialLocation: '/home',
    refreshListenable: refreshListenable,
    redirect: (context, state) {
      final isSignedIn = isSignedInUser(FirebaseAuth.instance.currentUser);
      final path = state.uri.path;
      final isLoggingIn = path == '/login';

      if (!isSignedIn) return isLoggingIn ? null : '/login';
      if (isLoggingIn) return '/home';
      if (path == '/' || path.isEmpty) return '/home';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) =>
            NoTransitionPage(key: state.pageKey, child: const LoginPage()),
      ),
      GoRoute(path: '/', redirect: (context, state) => '/home'),
      ShellRoute(
        builder: (context, state, child) =>
            MainShell(currentPath: state.uri.path, child: child),
        routes: [
          GoRoute(
            path: '/assignment/:type/:id',
            pageBuilder: (context, state) {
              final id = state.pathParameters['id'] ?? '';
              final type = state.pathParameters['type'] ?? '';
              if (id == 'pending') {
                return NoTransitionPage(
                  key: state.pageKey,
                  child: ContinueReviewLoadingPage(type: type),
                );
              }
              final Widget page = switch (type) {
                'vocab' => VocabSessionPage(assignmentId: id),
                'translation' => TranslationSessionPage(assignmentId: id),
                'production' => ProductionSessionPage(assignmentId: id),
                _ => VocabSessionPage(assignmentId: id),
              };
              return NoTransitionPage(key: state.pageKey, child: page);
            },
          ),
          GoRoute(
            path: '/home',
            pageBuilder: (context, state) =>
                NoTransitionPage(key: state.pageKey, child: const HomePage()),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (context, state) => NoTransitionPage(
              key: state.pageKey,
              child: const ProfilePage(),
            ),
          ),
          GoRoute(
            path: '/onboarding',
            pageBuilder: (context, state) => NoTransitionPage(
              key: state.pageKey,
              child: const StudentConnectionPage(),
            ),
          ),
        ],
      ),
    ],
  );
});
