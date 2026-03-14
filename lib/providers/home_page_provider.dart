import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/home_page_models.dart';
import '../services/home_page_api_calls.dart';

/// Ensures we have a signed-in user and a fresh token before calling callables (avoids UNAUTHENTICATED).
Future<void> _waitForAuth() async {
  User? user = FirebaseAuth.instance.currentUser;
  if (user == null) {
    await FirebaseAuth.instance.authStateChanges()
        .timeout(const Duration(seconds: 15))
        .firstWhere((u) => u != null);
    user = FirebaseAuth.instance.currentUser;
  }
  if (user != null) {
    await user.getIdToken(true);
  }
}

final homePageDataProvider = FutureProvider.autoDispose<HomePageData>((ref) async {
  await _waitForAuth();
  return getHomePageData(userId: demoUserId);
});
