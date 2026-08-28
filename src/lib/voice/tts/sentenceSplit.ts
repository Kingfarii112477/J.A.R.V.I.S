/**
 * Splits a growing, streamed text buffer into sentences as they become
 * complete, so the speech queue can start speaking sentence 1 while the
 * model is still generating sentence 2 — "reduce perceived latency"
 * rather than waiting for the whole response. Deliberately a punctuation
 * heuristic (English/Urdu sentence-ending marks followed by whitespace),
 * not real NLP sentence segmentation: an abbreviation like "e.g." can
 * cause an extra pause where a linguist wouldn't put one, but it never
 * drops or duplicates any words, which is the property that actually
 * matters here.
 */
const SENTENCE_BOUNDARY = /[.!?۔]+\s+/g;

/**
 * Given the full accumulated buffer and how much of it has already been
 * extracted as complete sentences, returns any NEWLY complete sentences
 * found since then, plus the updated consumed-length to pass in next
 * time. A sentence only counts once it's followed by whitespace within
 * the buffer — a terminator sitting right at the buffer's current end is
 * treated as still-arriving text, not a boundary, since more of the
 * response may still be streaming in immediately after it.
 */
export function extractNewCompleteSentences(buffer: string, consumedLength: number): { sentences: string[]; consumedLength: number } {
  const suffix = buffer.slice(consumedLength);
  if (!suffix) return { sentences: [], consumedLength };

  const sentences: string[] = [];
  let lastEnd = 0;
  const regex = new RegExp(SENTENCE_BOUNDARY.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(suffix)) !== null) {
    const end = match.index + match[0].length;
    const sentence = suffix.slice(lastEnd, end).trim();
    if (sentence) sentences.push(sentence);
    lastEnd = end;
  }
  return { sentences, consumedLength: consumedLength + lastEnd };
}

/** Whatever's left after the last confirmed sentence boundary — call once
 * streaming has actually finished, when there's no more text coming that
 * could turn a bare trailing terminator into a real boundary. */
export function remainderAfter(buffer: string, consumedLength: number): string {
  return buffer.slice(consumedLength).trim();
}
