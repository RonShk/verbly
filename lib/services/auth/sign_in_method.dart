import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

/// Identifier returned to the UI when a sign-in method declares why an
/// attempt failed. The login page uses this to decide whether to surface a
/// snack bar (genuine error) or stay silent (user-initiated cancel).
enum SignInStatus { success, canceled, failed }

class SignInAttempt {
  const SignInAttempt({
    required this.status,
    this.credential,
    this.errorMessage,
  });

  factory SignInAttempt.success(UserCredential credential) => SignInAttempt(status: SignInStatus.success, credential: credential);
  factory SignInAttempt.canceled() => const SignInAttempt(status: SignInStatus.canceled);
  factory SignInAttempt.failed(String message) => SignInAttempt(status: SignInStatus.failed, errorMessage: message);

  final SignInStatus status;
  final UserCredential? credential;
  final String? errorMessage;
}

/// Contract every sign-in method (Google, Apple, email, etc.) must implement.
///
/// Register implementations with [UserSession]. The login page renders one
/// button per registered method using [displayName], [icon], and
/// [brandBackgroundColor] — no other UI code needs to change.
abstract class SignInMethod {
  /// Stable id used for analytics / logs (`'google'`, `'apple'`, ...).
  String get id;

  /// Button label shown on the login page.
  String get displayName;

  /// Brand icon shown on the login button.
  Widget get icon;

  /// Brand background color for the button.
  Color get brandBackgroundColor;

  /// Brand text/icon color for the button.
  Color get brandForegroundColor;

  /// Called once at app startup before any sign-in attempts. Use this to
  /// run SDK-specific initialization (e.g. `GoogleSignIn.initialize`).
  Future<void> initialize();

  /// Triggers the method-specific sign-in UI, exchanges credentials with
  /// Firebase Auth, and returns the resulting [UserCredential]. Wraps
  /// user-cancel and error states in [SignInAttempt] so the caller can
  /// stay method-agnostic.
  Future<SignInAttempt> signIn();

  /// Method-side cleanup invoked after [FirebaseAuth.signOut]. Implementations
  /// should swallow non-critical errors (e.g. "no current user") to keep
  /// sign-out idempotent.
  Future<void> signOut();
}
