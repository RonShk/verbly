import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/auth/google_sign_in_method.dart';
import '../services/auth/sign_in_method.dart';
import '../services/auth/user_session.dart';

/// Web client (server) OAuth client id for the Firebase project. Used as
/// `serverClientId` on Android so Credential Manager mints an idToken Firebase
/// will accept; iOS reads `GIDClientID` from `Info.plist`, so this also gets
/// passed there for parity.
const String _googleServerClientId = '47390662133-p3u2gs1u69nftj3d24p0ghpojbvgrh6i.apps.googleusercontent.com';

/// Singleton [UserSession] for the app. Sign-in method list lives here — adding
/// Apple (etc.) is just appending another [SignInMethod] to the constructor.
final userSessionProvider = Provider<UserSession>((ref) {
  return UserSession(signInMethods: [GoogleSignInMethod(serverClientId: _googleServerClientId)]);
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
  final notifier = _RouterAuthRefreshNotifier(ref.watch(userSessionProvider).watchFirebaseUser());
  ref.onDispose(notifier.dispose);
  return notifier;
});

/// Returns true once Firebase Auth has emitted its first state. The router
/// can use this to delay redirects until we know whether a stored session
/// is being restored, avoiding a flash of `/login` on cold start.
final authStreamHasEmittedProvider = Provider<bool>((ref) {
  return ref.watch(firebaseUserProvider).hasValue;
});
