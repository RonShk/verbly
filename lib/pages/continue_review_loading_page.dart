import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/production_session_provider.dart';
import '../providers/translation_session_provider.dart';
import '../providers/vocab_session_provider.dart';
import '../services/production_session_api_calls.dart';
import '../services/translation_session_api_calls.dart';
import '../widgets/practice_loading/practice_session_skeleton.dart';

/// Shows the practice shell immediately while the server creates the next
/// Continue Review wave and returns its assignment id.
class ContinueReviewLoadingPage extends ConsumerStatefulWidget {
  const ContinueReviewLoadingPage({super.key, required this.type});

  final String type;

  @override
  ConsumerState<ContinueReviewLoadingPage> createState() =>
      _ContinueReviewLoadingPageState();
}

class _ContinueReviewLoadingPageState
    extends ConsumerState<ContinueReviewLoadingPage> {
  Object? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _prepareReview());
  }

  Future<void> _prepareReview() async {
    try {
      final assignmentId = switch (widget.type) {
        'vocab' =>
          await ref.read(vocabSessionProvider.notifier).startContinueReview(),
        'translation' =>
          (await prepareTranslationContinueReview()).assignmentId,
        'production' => (await prepareProductionContinueReview()).assignmentId,
        _ => '',
      };

      if (assignmentId.isEmpty) {
        throw StateError('Continue Review did not return an assignment.');
      }

      if (widget.type == 'translation') {
        ref.read(translationDailyProvider.notifier).clear();
      } else if (widget.type == 'production') {
        ref.read(productionDailyProvider.notifier).clear();
      }

      if (!mounted) return;
      context.replace('/assignment/${widget.type}/$assignmentId');
    } catch (error) {
      if (mounted) setState(() => _error = error);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        backgroundColor: const Color(0xFF0E1523),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Could not start Continue Review',
                  style: TextStyle(color: Colors.white, fontSize: 18),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    setState(() => _error = null);
                    _prepareReview();
                  },
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final label = switch (widget.type) {
      'vocab' => ('VOCABULARY MODE', 'Vocabulary practice'),
      'translation' => ('TRANSLATION MODE', 'Translation practice'),
      _ => ('PRODUCTION MODE', 'Production practice'),
    };

    return Scaffold(
      backgroundColor: const Color(0xFF0E1523),
      body: SafeArea(
        child: PracticeSessionSkeleton(modeLabel: label.$1, title: label.$2),
      ),
    );
  }
}
