import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../constants/legal_urls.dart';
import '../theme/app_colors.dart';

class LegalLinks extends StatelessWidget {
  const LegalLinks({super.key, this.introText});

  final String? introText;

  Future<void> _open(BuildContext context, String url) async {
    final opened = await launchUrl(
      Uri.parse(url),
      mode: LaunchMode.externalApplication,
    );
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open this link.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (introText != null) ...[
          Text(
            introText!,
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.navbarInactive, fontSize: 12),
          ),
          const SizedBox(height: 4),
        ],
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 4,
          children: [
            TextButton(
              onPressed: () => _open(context, studentTermsUrl),
              child: const Text('Terms of Service'),
            ),
            TextButton(
              onPressed: () => _open(context, studentPrivacyUrl),
              child: const Text('Privacy Policy'),
            ),
          ],
        ),
      ],
    );
  }
}
