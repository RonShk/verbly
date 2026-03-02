import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'firebase_options.dart';
import 'pages/home_page.dart';
import 'pages/profile_page.dart';
import 'pages/reading_vocab_session_page.dart';
import 'pages/vocab_session_page.dart';
import 'widgets/navbar.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  if (kDebugMode) {
    FirebaseFunctions.instance.useFunctionsEmulator('localhost', 5001);
  }
  runApp(const ProviderScope(child: MyApp()));
}

/// Routes for the app. GoRouter picks the screen based on the URL path.
final _router = GoRouter(
  initialLocation: '/home',
  redirect: (context, state) {
    final path = state.uri.path;
    if (path == '/' || path.isEmpty) return '/home';
    return null;
  },
  routes: [
    // Handle / so the shell never sees it (avoids null child when redirect runs).
    GoRoute(
      path: '/',
      redirect: (context, state) => '/home',
    ),
    GoRoute(
      path: '/assignment/:type/:id',
      pageBuilder: (context, state) {
        final id = state.pathParameters['id'] ?? '';
        final type = state.pathParameters['type'] ?? '';
        final Widget page = switch (type) {
          'vocab' => VocabSessionPage(assignmentId: id),
          'reading_vocab' => ReadingVocabSessionPage(assignmentId: id),
          _ => VocabSessionPage(assignmentId: id),
        };
        return NoTransitionPage(
          key: state.pageKey,
          child: page,
        );
      },
    ),
    ShellRoute(
      builder: (context, state, child) => MainShell(
        currentPath: state.uri.path,
        child: child,
      ),
      routes: [
        GoRoute(
          path: '/home',
          pageBuilder: (context, state) => NoTransitionPage(
            key: state.pageKey,
            child: const HomePage(),
          ),
        ),
        GoRoute(
          path: '/profile',
          pageBuilder: (context, state) => NoTransitionPage(
            key: state.pageKey,
            child: const ProfilePage(),
          ),
        ),
      ],
    ),
  ],
);

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Vocab Forge',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color.fromARGB(255, 55, 149, 86)),
      ),
      routerConfig: _router,
    );
  }
}
