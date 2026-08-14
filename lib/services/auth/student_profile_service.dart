import 'package:cloud_firestore/cloud_firestore.dart';

class StudentProfile {
  const StudentProfile({required this.teacherId, required this.inviteAccepted});

  final String? teacherId;
  final bool inviteAccepted;

  /// A teacherId can exist on legacy/pending records. The app should only
  /// unlock the dashboard after the invite redemption transaction records its
  /// explicit acceptance marker.
  bool get isOnboarded => teacherId != null && teacherId!.isNotEmpty;

  bool get wasRemoved => !isOnboarded && inviteAccepted;

  factory StudentProfile.fromSnapshot(
    DocumentSnapshot<Map<String, dynamic>> snapshot,
  ) {
    final teacherId = snapshot.data()?['teacherId'];
    final inviteAccepted = snapshot.data()?['inviteAcceptedAt'] != null;
    return StudentProfile(
      teacherId: teacherId is String && teacherId.isNotEmpty ? teacherId : null,
      inviteAccepted: inviteAccepted,
    );
  }
}

Future<StudentProfile> loadStudentProfile(String? uid) async {
  if (uid == null) {
    return const StudentProfile(teacherId: null, inviteAccepted: false);
  }
  final snapshot = await FirebaseFirestore.instance
      .collection('students')
      .doc(uid)
      .get();
  return StudentProfile.fromSnapshot(snapshot);
}

Stream<StudentProfile> watchStudentProfile(String? uid) {
  if (uid == null) {
    return Stream.value(
      const StudentProfile(teacherId: null, inviteAccepted: false),
    );
  }
  return FirebaseFirestore.instance
      .collection('students')
      .doc(uid)
      .snapshots()
      .map(StudentProfile.fromSnapshot);
}
