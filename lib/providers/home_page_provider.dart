import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/demo_user.dart';
import '../models/home_page_models.dart';
import '../services/home_page_api_calls.dart';

final homePageDataProvider = FutureProvider.autoDispose<HomePageData>((ref) async {
  return getHomePageData(userId: demoUserId);
});
