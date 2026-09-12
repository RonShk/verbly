import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';

/// Deletes the authenticated user's account and personal backend data.
Future<void> deleteAccount() async {
  final auth = FirebaseAuth.instance;
  final user = auth.currentUser;
  final usesApple =
      user?.providerData.any(
        (provider) => provider.providerId == 'apple.com',
      ) ??
      false;

  // Reauthenticate to get Apple's short-lived authorization code, then revoke
  // the Apple authorization before the Firebase account disappears.
  if (usesApple &&
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.macOS)) {
    final provider = AppleAuthProvider()
      ..addScope('email')
      ..addScope('name');
    final credential = await user!.reauthenticateWithProvider(provider);
    final authorizationCode = credential.additionalUserInfo?.authorizationCode;
    if (authorizationCode == null || authorizationCode.isEmpty) {
      throw FirebaseAuthException(
        code: 'missing-apple-authorization-code',
        message:
            'Apple did not return the authorization needed to delete this account.',
      );
    }
    await auth.revokeTokenWithAuthorizationCode(authorizationCode);
  }

  final callable = FirebaseFunctions.instance.httpsCallable('deleteAccount');
  await callable.call();
}
