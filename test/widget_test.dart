import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:vocab_forge/main.dart';
import 'package:vocab_forge/pages/login_page.dart';
import 'package:vocab_forge/providers/user_session_provider.dart';
import 'package:vocab_forge/router.dart';

void main() {
  testWidgets('renders the signed-out app shell', (WidgetTester tester) async {
    final testRouter = GoRouter(
      initialLocation: '/login',
      routes: [GoRoute(path: '/login', builder: (_, _) => const LoginPage())],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          goRouterProvider.overrideWithValue(testRouter),
          ensureStudentDocProvider.overrideWithValue(null),
        ],
        child: const MyApp(),
      ),
    );

    expect(find.text('Welcome to Verbly'), findsOneWidget);
  });
}
