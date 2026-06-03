/**
 * Incrementally extracts complete objects from a streamed JSON payload of the
 * shape `{"questions": [ {...}, {...}, ... ]}`.
 *
 * Gemini structured-output streaming emits partial JSON strings. We buffer the
 * accumulated text and, each time more text arrives, return any array elements
 * that have become syntactically complete since the last call. The caller can
 * then JSON.parse and persist each element as soon as it is ready, instead of
 * waiting for the whole response.
 *
 * Only the top-level `questions` array is scanned; nested arrays/objects inside
 * each element are handled via brace-depth and string-state tracking.
 */
export class StreamingJsonArrayExtractor {
  private buffer = "";
  private arrayStarted = false;
  private cursor = 0;
  private depth = 0;
  private inString = false;
  private escape = false;
  private elementStart = -1;
  private done = false;

  /** Key whose array value we extract elements from. */
  private readonly arrayKey: string;

  constructor(arrayKey = "questions") {
    this.arrayKey = `"${arrayKey}"`;
  }

  /**
   * Appends a streamed text delta and returns any newly-completed element
   * strings (each a self-contained JSON object string).
   */
  push(chunk: string): string[] {
    if (this.done) return [];
    this.buffer += chunk;
    const completed: string[] = [];

    if (!this.arrayStarted) {
      const keyIdx = this.buffer.indexOf(this.arrayKey);
      if (keyIdx === -1) return completed;
      const bracketIdx = this.buffer.indexOf("[", keyIdx);
      if (bracketIdx === -1) return completed;
      this.arrayStarted = true;
      this.cursor = bracketIdx + 1;
    }

    for (let i = this.cursor; i < this.buffer.length; i++) {
      const ch = this.buffer[i];

      if (this.inString) {
        if (this.escape) {
          this.escape = false;
        } else if (ch === "\\") {
          this.escape = true;
        } else if (ch === "\"") {
          this.inString = false;
        }
        continue;
      }

      if (ch === "\"") {
        this.inString = true;
      } else if (ch === "{") {
        if (this.depth === 0) this.elementStart = i;
        this.depth++;
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.elementStart !== -1) {
          completed.push(this.buffer.slice(this.elementStart, i + 1));
          this.elementStart = -1;
        }
      } else if (ch === "]" && this.depth === 0) {
        // End of the questions array.
        this.done = true;
        this.cursor = i + 1;
        return completed;
      }
    }

    this.cursor = this.buffer.length;
    return completed;
  }
}
