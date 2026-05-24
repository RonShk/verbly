import 'package:firebase_auth/firebase_auth.dart';

import 'sign_in_method.dart';

/// True when [user] is a real account (Google, Apple, etc.), not legacy anonymous.
bool isSignedInUser(User? user) => user != null && !user.isAnonymous;

/// Logged-in user lifecycle: current user, auth stream, sign-out, and the
/// list of registered [SignInMethod] instances.
///
/// The login page iterates [signInMethods] to render one button per method.
/// Adding Apple (etc.) only requires implementing [SignInMethod] and appending
/// it to the constructor list.
class UserSession {
  UserSession({required List<SignInMethod> signInMethods}) : _signInMethods = List.unmodifiable(signInMethods);

  final List<SignInMethod> _signInMethods;

  List<SignInMethod> get signInMethods => _signInMethods;

  /// Runs `initialize()` on every registered sign-in method once at app startup,
  /// then clears any persisted anonymous session from before real auth existed.
  Future<void> initialize() async {
    for (final method in _signInMethods) {
      await method.initialize();
    }
    await clearAnonymousSessionIfPresent();
  }

  /// Signs out if Firebase still has an anonymous user from the old app flow.
  Future<void> clearAnonymousSessionIfPresent() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user != null && user.isAnonymous) await signOut();
  }

  /// Firebase Auth current user (may be null if signed out).
  User? get currentUser => FirebaseAuth.instance.currentUser;

  bool get isSignedIn => isSignedInUser(currentUser);

  /// Stream of auth state changes (sign in / sign out). Wrapped by Riverpod
  /// `firebaseUserProvider` so widgets can react without holding a direct
  /// FirebaseAuth reference.
  Stream<User?> watchFirebaseUser() => FirebaseAuth.instance.authStateChanges();

  /// Sign out from Firebase **and** every configured sign-in method so the next
  /// `signIn()` cleanly shows the account picker again.
  Future<void> signOut() async {
    await FirebaseAuth.instance.signOut();
    for (final method in _signInMethods) {
      await method.signOut();
    }
  }
}
