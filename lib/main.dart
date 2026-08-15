import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'firebase_options.dart';
import 'providers/user_session_provider.dart';
import 'router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  // Build the ProviderScope first so we can prime UserSession (which
  // initializes every registered SignInMethod, e.g. GoogleSignIn) before
  // the first frame renders.
  final container = ProviderContainer();
  await container.read(userSessionProvider).initialize();

  runApp(UncontrolledProviderScope(container: container, child: const MyApp()));
}

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(ensureStudentDocProvider);
    final router = ref.watch(goRouterProvider);
    return MaterialApp.router(
      title: 'Verbly',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color.fromARGB(255, 55, 149, 86),
        ),
      ),
      routerConfig: router,
    );
  }
}
