import 'package:cloud_functions/cloud_functions.dart';

class StudentInviteException implements Exception {
  const StudentInviteException(this.message, {this.code});

  final String message;
  final String? code;

  @override
  String toString() => message;
}

/// Attempts to accept the pending invitation addressed to the signed-in
/// Firebase email. The server now finds the invitation by authenticated email;
/// students never enter or handle an invite code in the app.
Future<String> acceptStudentInvite() async {
  try {
    final result = await FirebaseFunctions.instance
        .httpsCallable('acceptStudentInvite')
        .call(<String, dynamic>{});
    final data = result.data;
    final teacherUid = data is Map ? data['teacherUid'] : null;
    if (data is Map &&
        data['accepted'] == true &&
        teacherUid is String &&
        teacherUid.isNotEmpty) {
      return teacherUid;
    }
    throw const StudentInviteException(
      'The tutor connection response was incomplete. Please try again.',
    );
  } on FirebaseFunctionsException catch (error) {
    if (error.code == 'not-found') {
      throw const StudentInviteException(
        'No pending tutor invitation was found for this account.',
        code: 'not-found',
      );
    }
    if (error.code == 'unauthenticated') {
      throw const StudentInviteException(
        'Please sign in again before connecting to a tutor.',
        code: 'unauthenticated',
      );
    }
    throw StudentInviteException(
      'We could not check your tutor connection. Please try again.',
      code: error.code,
    );
  }
}
