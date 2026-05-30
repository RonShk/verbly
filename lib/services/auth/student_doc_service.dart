import 'package:cloud_functions/cloud_functions.dart';

Future<void> ensureStudentDocExists() async {
  final callable = FirebaseFunctions.instance.httpsCallable('createStudentDoc');
  await callable.call();
}
