import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'firebase_options.dart';
import 'teacher/upload_vocab_page.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
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
  final user = FirebaseAuth.instance.currentUser;
  if (user == null) {
    throw StateError('Failed to sign in anonymously.');
  }
  await user.getIdToken(true);
  runApp(const TeacherApp());
}

/// Teacher dashboard entry point.
class TeacherApp extends StatelessWidget {
  const TeacherApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Vocab Forge – Teacher',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color.fromARGB(255, 55, 149, 86)),
        useMaterial3: true,
      ),
      home: const UploadVocabPage(),
    );
  }
}
