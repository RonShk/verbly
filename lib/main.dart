import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kDebugMode, kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'firebase_options.dart';
import 'providers/user_session_provider.dart';
import 'router.dart';

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
      title: 'Verbly - Vocab & Practice',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color.fromARGB(255, 55, 149, 86)),
      ),
      routerConfig: router,
    );
  }
}
