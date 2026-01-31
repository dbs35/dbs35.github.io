/**
 * Sentence buffer for detecting sentence boundaries in streaming text.
 * Used to chunk Claude's response into sentences for progressive TTS.
 */

// Common abbreviations that end with a period but aren't sentence endings
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'inc', 'ltd', 'co',
  'st', 'ave', 'blvd', 'rd', 'apt', 'no', 'vol', 'rev', 'gen', 'col', 'lt',
  'sgt', 'capt', 'cmdr', 'adm', 'gov', 'sen', 'rep', 'hon', 'pres',
  'i.e', 'e.g', 'cf', 'al', 'et'
]);

export class SentenceBuffer {
  private buffer: string = '';
  private minSentenceLength: number;

  constructor(minSentenceLength: number = 20) {
    this.minSentenceLength = minSentenceLength;
  }

  /**
   * Add text to the buffer and extract any complete sentences.
   * Returns an array of complete sentences (may be empty).
   */
  addText(text: string): string[] {
    this.buffer += text;
    return this.extractSentences();
  }

  /**
   * Flush any remaining text as a final sentence.
   * Call this when the stream ends.
   */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = '';
    return remaining.length > 0 ? remaining : null;
  }

  /**
   * Get current buffer content (for debugging).
   */
  getBuffer(): string {
    return this.buffer;
  }

  private extractSentences(): string[] {
    const sentences: string[] = [];

    while (true) {
      const sentenceEnd = this.findSentenceEnd();
      if (sentenceEnd === -1) break;

      const sentence = this.buffer.slice(0, sentenceEnd + 1).trim();
      this.buffer = this.buffer.slice(sentenceEnd + 1);

      if (sentence.length >= this.minSentenceLength) {
        sentences.push(sentence);
      } else if (sentences.length > 0) {
        // Append short sentence to previous one
        sentences[sentences.length - 1] += ' ' + sentence;
      } else {
        // Keep short sentence in buffer for now
        this.buffer = sentence + this.buffer;
        break;
      }
    }

    return sentences;
  }

  private findSentenceEnd(): number {
    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      // Check for sentence-ending punctuation
      if (char === '.' || char === '!' || char === '?') {
        // Check if this is a valid sentence end
        if (this.isValidSentenceEnd(i)) {
          return i;
        }
      }
    }

    return -1;
  }

  private isValidSentenceEnd(pos: number): boolean {
    const char = this.buffer[pos];

    // Must be followed by space + capital letter, or end of substantial text
    const after = this.buffer.slice(pos + 1);

    // Need more text after to determine if it's a sentence end
    if (after.length < 2 && after.length > 0) {
      return false; // Wait for more text
    }

    // Check what comes after
    if (after.length >= 2) {
      const afterTrimmed = after.trimStart();
      // If next non-space character is lowercase, probably not a sentence end
      if (afterTrimmed.length > 0 && /^[a-z]/.test(afterTrimmed)) {
        return false;
      }
    }

    // Check for period-specific rules
    if (char === '.') {
      // Check for abbreviations
      if (this.isAbbreviation(pos)) {
        return false;
      }

      // Check for decimal numbers (e.g., "3.5")
      if (this.isDecimalNumber(pos)) {
        return false;
      }

      // Check for ellipsis (...)
      if (this.isEllipsis(pos)) {
        return false;
      }
    }

    return true;
  }

  private isAbbreviation(pos: number): boolean {
    // Look backwards to find the word before the period
    let wordStart = pos - 1;
    while (wordStart >= 0 && /[a-zA-Z.]/.test(this.buffer[wordStart])) {
      wordStart--;
    }
    wordStart++;

    const word = this.buffer.slice(wordStart, pos).toLowerCase();
    return ABBREVIATIONS.has(word);
  }

  private isDecimalNumber(pos: number): boolean {
    // Check if there's a digit before and after the period
    const before = pos > 0 ? this.buffer[pos - 1] : '';
    const after = pos < this.buffer.length - 1 ? this.buffer[pos + 1] : '';

    return /\d/.test(before) && /\d/.test(after);
  }

  private isEllipsis(pos: number): boolean {
    // Check for ... pattern
    const slice = this.buffer.slice(Math.max(0, pos - 2), pos + 3);
    return slice.includes('...');
  }
}
