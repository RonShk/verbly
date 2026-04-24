import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'firebase_options.dart';
import 'pages/home_page.dart';
import 'pages/profile_page.dart';
import 'pages/production_session_page.dart';
import 'pages/translation_session_page.dart';
import 'pages/vocab_session_page.dart';
import 'widgets/navbar.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  // Debug builds: callables hit the local Functions emulator (default port 5001).
  if (kDebugMode) {
    const functionsEmulatorPort = 5001;
    if (kIsWeb) {
      FirebaseFunctions.instance.useFunctionsEmulator('127.0.0.1', functionsEmulatorPort);
    } else {
      final host = defaultTargetPlatform == TargetPlatform.android ? '10.0.2.2' : '127.0.0.1';
      FirebaseFunctions.instance.useFunctionsEmulator(host, functionsEmulatorPort);
    }
  }
  // Callable functions require an authenticated request. Sign in anonymously
  // so the SDK sends an ID token; the functions still use userId from the body.
  if (FirebaseAuth.instance.currentUser == null) {
    try {
      await FirebaseAuth.instance.signInAnonymously();
    } on FirebaseAuthException catch (e) {
      switch (e.code) {
        case 'operation-not-allowed':
          throw StateError(
            'Anonymous auth is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.',
          );
        default:
          rethrow;
      }
    }
  }
  // Ensure we have a user and a token so callables get an ID token.
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) {
    throw StateError('Failed to sign in anonymously.');
  }
  // Force token to be ready so the first callable request is authenticated.
  await user.getIdToken(true);
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
          'translation' => TranslationSessionPage(assignmentId: id),
          'production' => ProductionSessionPage(assignmentId: id),
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
