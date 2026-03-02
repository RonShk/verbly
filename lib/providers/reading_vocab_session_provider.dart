import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/reading_vocab_session_models.dart';
import '../services/reading_vocab_session_api_calls.dart';

final readingVocabSessionProvider = FutureProvider.autoDispose.family<ReadingVocabSessionData, String>((ref, assignmentId) async {
  return getReadingVocabSession(
    assignmentId: assignmentId,
    userId: demoUserId,
  );
});
