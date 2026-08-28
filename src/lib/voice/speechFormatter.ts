/**
 * Converts an assistant message's display text into TTS-safe speech. Never
 * mutates the original text — callers keep `message.content` for the chat
 * bubble and store this function's output separately as
 * `message.speechContent` (see types/jarvis.ts's ChatMessage), so the
 * screen and the voice can differ appropriately (e.g. a data table read
 * aloud as a sentence, still shown as a table on screen).
 */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const TEENS = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function numberBelow1000ToWords(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const rest = n % 10;
    return rest === 0 ? tens : `${tens}-${ONES[rest]}`;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return rest === 0 ? `${ONES[hundreds]} hundred` : `${ONES[hundreds]} hundred ${numberBelow1000ToWords(rest)}`;
}

/** Small-integer number-to-words — covers the realistic range for system
 * stats/counts (percentages, task counts, ports). Larger or non-integer
 * numbers (timestamps, decimals, IDs) are left as digits — a TTS engine
 * reads plain digit runs reasonably on its own, and guessing at a
 * "natural" reading for e.g. a UUID would just be wrong. */
export function numberToWords(raw: string): string {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 9999 || String(n) !== raw.replace(/^0+(?=\d)/, "")) return raw;
  if (n === 0) return "zero";
  if (n < 1000) return numberBelow1000ToWords(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return rest === 0 ? `${ONES[thousands]} thousand` : `${ONES[thousands]} thousand ${numberBelow1000ToWords(rest)}`;
}

function stripCodeBlocks(text: string): { text: string; hadCode: boolean } {
  let hadCode = false;
  const withoutFences = text.replace(/```[\s\S]*?```/g, () => {
    hadCode = true;
    return " ";
  });
  const withoutInlineCode = withoutFences.replace(/`([^`]+)`/g, "$1");
  return { text: withoutInlineCode, hadCode };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "") // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "") // bullet markers
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1"); // [text](url) -> text
}

function stripUrlsAndJson(text: string): string {
  let out = text.replace(/https?:\/\/\S+/gi, "a link");
  // A line that's mostly JSON punctuation (braces/brackets/quotes/colons)
  // isn't meant to be spoken character-by-character — summarize instead.
  out = out.replace(/\{[^{}]{0,4000}\}/g, (match) => {
    const symbolDensity = (match.match(/[{}[\]":,]/g)?.length ?? 0) / Math.max(1, match.length);
    return symbolDensity > 0.15 ? "structured data" : match;
  });
  return out;
}

function expandInlineNumbers(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s*%/g, (_m, num) => `${numberToWords(num)} percent`)
    .replace(/&/g, " and ")
    .replace(/\b(\d{1,4})\b/g, (m) => numberToWords(m));
}

function collapsePunctuation(text: string): string {
  return text
    .replace(/\|/g, " ") // markdown table pipes
    .replace(/[-=]{3,}/g, " ") // horizontal rules / table separators
    .replace(/\s{2,}/g, " ")
    .replace(/([.!?])\1+/g, "$1")
    .trim();
}

/** Turns "CPU: 47%\nMemory: 61%\nStatus: stable" into natural spoken
 * sentences ("CPU is 47 percent. Memory is 61 percent. Status is stable.")
 * — a line-based key: value pattern is common in this app's tool
 * summaries (system_status, run_diagnostics). Lines that don't match the
 * pattern pass through unchanged. */
function speakifyKeyValueLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^\s*([\w][\w\s]{0,40}):\s*(.+)$/);
      if (!match) return line;
      const [, label, value] = match;
      return `${label.trim()} is ${value.trim()}.`;
    })
    .join(" ");
}

export interface SpeechFormatOptions {
  /** Set when the source text is known to contain a fenced code block, so
   * the caller can decide whether to mention "I've included some code in
   * the chat" — kept optional since most callers don't need it. */
  onCodeBlockFound?: () => void;
}

/**
 * The main entry point: given the assistant's on-screen markdown/text,
 * produce a plain, speech-safe string. Idempotent and pure — safe to call
 * on every assistant turn regardless of whether TTS actually ends up
 * running (autoSpeak off, voice disabled, etc. are handled by the caller).
 */
export function formatForSpeech(text: string, options: SpeechFormatOptions = {}): string {
  if (!text.trim()) return "";

  const { text: withoutCode, hadCode } = stripCodeBlocks(text);
  if (hadCode) options.onCodeBlockFound?.();

  let out = stripMarkdown(withoutCode);
  out = stripUrlsAndJson(out);
  out = speakifyKeyValueLines(out);
  out = expandInlineNumbers(out);
  out = collapsePunctuation(out);

  return out;
}
