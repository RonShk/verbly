import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'sign_in_method.dart';

/// Apple Sign-In backed by Firebase Auth's native federated provider flow.
///
/// On iOS this uses the Sign in with Apple capability configured on Runner.
/// No separate `sign_in_with_apple` package is required.
class AppleSignInMethod implements SignInMethod {
  @override
  String get id => 'apple';

  @override
  String get displayName => 'Continue with Apple';

  @override
  Widget get icon => const Icon(Icons.apple, size: 24);

  @override
  Color get brandBackgroundColor => Colors.black;

  @override
  Color get brandForegroundColor => Colors.white;

  @override
  Future<void> initialize() async {}

  @override
  Future<SignInAttempt> signIn() async {
    try {
      final provider = AppleAuthProvider()
        ..addScope('email')
        ..addScope('name');

      final userCredential = kIsWeb
          ? await FirebaseAuth.instance.signInWithPopup(provider)
          : await FirebaseAuth.instance.signInWithProvider(provider);

      return SignInAttempt.success(userCredential);
    } on FirebaseAuthException catch (e) {
      if (_isCancellation(e.code)) {
        return SignInAttempt.canceled();
      }

      return SignInAttempt.failed(e.message ?? 'Apple sign-in failed (${e.code}).');
    } catch (e) {
      return SignInAttempt.failed(e.toString());
    }
  }

  @override
  Future<void> signOut() async {}

  bool _isCancellation(String code) {
    return code == 'canceled' ||
        code == 'popup-closed-by-user' ||
        code == 'web-context-canceled';
  }
}
