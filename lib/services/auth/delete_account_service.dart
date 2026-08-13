import 'package:cloud_functions/cloud_functions.dart';

/// Deletes the authenticated user's account and personal backend data.
Future<void> deleteAccount() async {
  final callable = FirebaseFunctions.instance.httpsCallable('deleteAccount');
  await callable.call();
}
