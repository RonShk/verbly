import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'sign_in_method.dart';

/// Google Sign-In implementation backed by `google_sign_in` ^7.x +
/// `firebase_auth`. Follows the post-7.0 API: explicit `initialize`,
/// `authenticate` for interactive sign-in, and `signInWithCredential` on
/// the Firebase side.
class GoogleSignInMethod implements SignInMethod {
  GoogleSignInMethod({this.serverClientId, this.clientId});

  /// OAuth client id of the **web** application registered with the same
  /// Firebase project. Required on Android (Credential Manager needs it to
  /// mint an idToken that Firebase will accept). Optional on iOS / web.
  final String? serverClientId;

  /// Platform-specific OAuth client id. iOS reads this from
  /// `GIDClientID` in `Info.plist` automatically, but you can override
  /// here. Required on web.
  final String? clientId;

  @override
  String get id => 'google';

  @override
  String get displayName => 'Continue with Google';

  @override
  Widget get icon => const Icon(Icons.g_mobiledata, size: 28);

  @override
  Color get brandBackgroundColor => Colors.white;

  @override
  Color get brandForegroundColor => const Color(0xFF1F1F1F);

  @override
  Future<void> initialize() async {
    await GoogleSignIn.instance.initialize(clientId: clientId, serverClientId: serverClientId);
  }

  @override
  Future<SignInAttempt> signIn() async {
    try {
      final account = await GoogleSignIn.instance.authenticate();
      final auth = account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        return SignInAttempt.failed('Google sign-in did not return an id token.');
      }

      final credential = GoogleAuthProvider.credential(idToken: idToken);
      final userCredential = await FirebaseAuth.instance.signInWithCredential(credential);

      return SignInAttempt.success(userCredential);
    } on GoogleSignInException catch (e) {

      if (e.code == GoogleSignInExceptionCode.canceled) {
        return SignInAttempt.canceled();
      }

      return SignInAttempt.failed(e.description ?? 'Google sign-in failed (${e.code.name}).');

    } on FirebaseAuthException catch (e) {
      return SignInAttempt.failed(e.message ?? 'Firebase sign-in failed (${e.code}).');
    } catch (e) {
      return SignInAttempt.failed(e.toString());
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await GoogleSignIn.instance.signOut();
    } catch (_) {
      // Ignore: method may already be in a signed-out state.
    }
  }
}
