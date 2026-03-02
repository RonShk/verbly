import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/production_session_models.dart';
import '../services/production_session_api_calls.dart';

final productionSessionProvider = FutureProvider.autoDispose.family<ProductionSessionData, String>((ref, assignmentId) async {
  return getProductionSession(
    assignmentId: assignmentId,
    userId: demoUserId,
  );
});
