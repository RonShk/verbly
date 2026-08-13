/// Generation lifecycle values stored on a sentence-practice assignment doc.
///
/// Mirrors `functions/src/assignments/sentence-practice/shared/core/generationStatus.ts`.
class GenerationStatus {
  const GenerationStatus._();

  static const String generating = 'generating';
  static const String ready = 'ready';
  static const String failed = 'failed';

  /// The student has no vocab words to practise. Terminal — the backend will
  /// not retry generation, so the UI shows a friendly message rather than an
  /// error with a Retry button. Resolves itself once their tutor adds words.
  static const String noVocab = 'no_vocab';
}
