import 'package:cloud_functions/cloud_functions.dart';

import '../models/home_page_data.dart';

/// Calls the getHomePageData callable and returns parsed HomePageData.
Future<HomePageData> getHomePageData({required String userId}) async {
  final callable = FirebaseFunctions.instance.httpsCallable('getHomePageData');
  final result = await callable.call({'userId': userId});
  final data = result.data;
  if (data is! Map) {
    throw Exception('getHomePageData returned unexpected type: ${data.runtimeType}');
  }
  return HomePageData.fromJson(data);
}
