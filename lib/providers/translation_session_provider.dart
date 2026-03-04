import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/translation_session_models.dart';
import '../services/translation_session_api_calls.dart';

final translationSessionProvider = FutureProvider.autoDispose.family<TranslationSessionData, String>((ref, assignmentId) async {
  return getTranslationSession(
    assignmentId: assignmentId,
    userId: demoUserId,
  );
});
