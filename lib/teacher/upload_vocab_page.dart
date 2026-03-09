import 'dart:convert';

import 'package:cloud_functions/cloud_functions.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

/// One word pair: learning language (e.g. Spanish) and English.
class VocabWord {
  const VocabWord({required this.learningLanguageWord, required this.englishWord});
  final String learningLanguageWord;
  final String englishWord;

  Map<String, String> toJson() => {
        'learningLanguageWord': learningLanguageWord.trim(),
        'englishWord': englishWord.trim(),
      };
}

/// Parses CSV or TXT content into word pairs.
/// Supports: "word,translation" or "word\ttranslation" per line.
List<VocabWord> parseVocabFile(String text) {
  final lines = text.split(RegExp(r'\r?\n'));
  final pairs = <VocabWord>[];
  for (final line in lines) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) continue;
    final parts = trimmed.contains('\t')
        ? trimmed.split(RegExp(r'\t'))
        : trimmed.split(RegExp(r','));
    if (parts.length >= 2) {
      final lang = parts[0].trim();
      final eng = parts[1].trim();
      if (lang.isNotEmpty && eng.isNotEmpty) {
        pairs.add(VocabWord(learningLanguageWord: lang, englishWord: eng));
      }
    }
  }
  return pairs;
}

class UploadVocabPage extends StatefulWidget {
  const UploadVocabPage({super.key});

  @override
  State<UploadVocabPage> createState() => _UploadVocabPageState();
}

class _UploadVocabPageState extends State<UploadVocabPage> {
  List<VocabWord> _words = [];
  bool _isLoading = false;
  String? _error;
  String? _success;

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['csv', 'txt'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    if (file.bytes == null || file.bytes!.isEmpty) return;
    final text = utf8.decode(file.bytes!);
    setState(() {
      _words = parseVocabFile(text);
      _error = null;
      _success = null;
    });
  }

  Future<void> _submit() async {
    _error = null;
    _success = null;
    if (_words.isEmpty) {
      setState(() => _error = 'Upload a file with at least one word pair.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final callable = FirebaseFunctions.instance.httpsCallable('addVocabWords');
      final body = {
        'userId': 'demo_user',
        'words': _words.map((w) => w.toJson()).toList(),
        'learningLanguage': 'es',
      };
      final result = await callable.call(body);
      final newAdded = result.data['newWordsAdded'] ?? 0;
      final total = result.data['totalWords'] ?? 0;
      if (mounted) {
        setState(() {
          _isLoading = false;
          _success = '$newAdded new word(s) added. Total vocab: $total.';
          _words = [];
        });
      }
    } catch (e, st) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = e.toString();
        });
      }
      debugPrint(st.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Upload weekly vocab'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Upload file (CSV or TXT)',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: _isLoading ? null : _pickFile,
                icon: const Icon(Icons.upload_file),
                label: Text(_words.isEmpty
                    ? 'Choose CSV or TXT'
                    : 'Replace file (${_words.length} pairs)'),
              ),
              if (_words.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  '${_words.length} word pair(s) loaded',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 24),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              if (_success != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _success!,
                    style: TextStyle(color: Theme.of(context).colorScheme.primary),
                  ),
                ),
              FilledButton(
                onPressed: _isLoading ? null : _submit,
                child: _isLoading
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Create vocab list for this week'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
