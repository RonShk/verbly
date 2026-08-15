import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/auth/google_sign_in_method.dart';
import '../services/auth/sign_in_method.dart';
import '../services/auth/student_doc_service.dart';
import '../services/auth/student_invite_service.dart';
import '../services/auth/student_profile_service.dart';
import '../services/auth/user_session.dart';
import '../services/student_vocab_service.dart';
import 'production_session_provider.dart';
import 'translation_session_provider.dart';
import 'vocab_session_provider.dart';
import '../services/auth/apple_sign_in_method.dart';

/// Web client (server) OAuth client id for the Firebase project. Used as
/// `serverClientId` on Android so Credential Manager mints an idToken Firebase
/// will accept; iOS reads `GIDClientID` from `Info.plist`, so this also gets
/// passed there for parity.
const String _googleServerClientId =
    '47390662133-p3u2gs1u69nftj3d24p0ghpojbvgrh6i.apps.googleusercontent.com';

/// Singleton [UserSession] for the app. Sign-in method list lives here — adding
/// Apple (etc.) is just appending another [SignInMethod] to the constructor.
final userSessionProvider = Provider<UserSession>((ref) {
  return UserSession(
    signInMethods: [
      GoogleSignInMethod(serverClientId: _googleServerClientId),
      AppleSignInMethod(),
    ],
  );
});

/// Streams Firebase Auth user. Widgets watch this to react to sign-in /
/// sign-out events; the router also depends on it via [routerAuthRefreshProvider].
final firebaseUserProvider = StreamProvider<User?>((ref) {
  final session = ref.watch(userSessionProvider);
  return session.watchFirebaseUser();
});

/// Synchronous "is the user signed in right now?" view used by the router
/// redirect. Defaults to false while the first stream event is in flight.
final hasSignedInUserProvider = Provider<bool>((ref) {
  return isSignedInUser(ref.watch(firebaseUserProvider).value);
});

/// `Listenable` adapter that notifies whenever the Firebase user stream emits.
/// Plugged into GoRouter's `refreshListenable` so route redirects re-evaluate
/// the moment the user signs in or out.
class _RouterAuthRefreshNotifier extends ChangeNotifier {
  _RouterAuthRefreshNotifier(Stream<User?> stream) {
    _subscription = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<User?> _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

final routerAuthRefreshProvider = Provider<Listenable>((ref) {
  final notifier = _RouterAuthRefreshNotifier(
    ref.watch(userSessionProvider).watchFirebaseUser(),
  );
  ref.onDispose(notifier.dispose);
  return notifier;
});

/// Returns true once Firebase Auth has emitted its first state. The router
/// can use this to delay redirects until we know whether a stored session
/// is being restored, avoiding a flash of `/login` on cold start.
final authStreamHasEmittedProvider = Provider<bool>((ref) {
  return ref.watch(firebaseUserProvider).hasValue;
});

/// Live student profile. The stream is important because a tutor can remove a
/// student while the app is open; the shell must react without requiring a
/// logout or app restart.
final studentProfileProvider = StreamProvider.autoDispose<StudentProfile>((
  ref,
) {
  final user = ref.watch(firebaseUserProvider).value;
  return watchStudentProfile(user?.uid);
});

enum StudentConnectionStatus { connected, noInvitation }

/// Connects a newly authenticated student using the email on their Firebase
/// account. Existing linked students skip the request.
final studentConnectionProvider =
    FutureProvider.autoDispose<StudentConnectionStatus>((ref) async {
      final user = ref.watch(firebaseUserProvider).value;
      if (user == null || user.isAnonymous) {
        return StudentConnectionStatus.noInvitation;
      }

      final profile = await ref.watch(studentProfileProvider.future);

      try {
        await acceptStudentInvite();
        ref.invalidate(studentProfileProvider);
        return StudentConnectionStatus.connected;
      } on StudentInviteException catch (error) {
        if (error.code == 'not-found') {
          // A returning student has no pending invite left to accept. A new
          // student with no teacher link should see the no-tutor state.
          return profile.isOnboarded
              ? StudentConnectionStatus.connected
              : StudentConnectionStatus.noInvitation;
        }
        rethrow;
      }
    });

/// Listens to auth state and creates a `students/{uid}` document the first
/// time a student signs in. The existence check prevents repeat logins from
/// overwriting the document. Must be watched at the app root to stay active.
final ensureStudentDocProvider = Provider<void>((ref) {
  ref.listen<AsyncValue<User?>>(firebaseUserProvider, (_, next) async {
    // These providers are long-lived in-memory caches. Invalidate them on
    // every auth transition so a second student cannot see the first
    // student's assignment counts while the new account is loading.
    ref.invalidate(vocabSessionProvider);
    ref.invalidate(translationDailyProvider);
    ref.invalidate(productionDailyProvider);
    ref.invalidate(studentProfileProvider);
    ref.invalidate(studentConnectionProvider);

    final user = next.value;
    if (user == null || user.isAnonymous) return;
    try {
      await ensureStudentDocExists();
      await touchStudentVocabLastActive();
    } catch (error, stackTrace) {
      // A bootstrap failure should not crash the authenticated app.
      debugPrint('Student bootstrap failed: $error\n$stackTrace');
    }
  });
});
