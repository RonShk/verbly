import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/vocab_session_models.dart';
import '../services/vocab_session_api_calls.dart';

final vocabSessionProvider = FutureProvider.autoDispose.family<VocabSessionData, String>((ref, assignmentId) async {
  return getVocabSession(
    assignmentId: assignmentId,
    userId: demoUserId,
  );
});
