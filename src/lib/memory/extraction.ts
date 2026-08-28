import type { MemoryType } from "@/types/memory";

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: number;
  /** 0..1 — how confident this deterministic pattern match is that the
   * extracted content is accurate. An explicit "remember X" or "my name
   * is X" is near-certain; a looser inference (e.g. profession) is not. */
  confidence: number;
}

interface ExtractionPattern {
  regex: RegExp;
  type: MemoryType;
  importance: number;
  confidence: number;
  format: (match: RegExpMatchArray) => string;
}

// Never let extraction persist anything shaped like a credential or
// financial secret, no matter which pattern matched it — a user saying
// "remember that my API key is sk-abc123..." must not create a permanent,
// retrievable memory record. Erring toward silently skipping storage (a
// false positive here just means "not remembered") is the safe failure
// mode; a leaked secret is not recoverable.
const SECRET_SHAPED_PATTERNS: RegExp[] = [
  /\bpass(?:word|phrase|wd)\b/i,
  /\bapi[_ -]?key\b/i,
  /\bsecret[_ -]?key\b/i,
  /\baccess[_ -]?token\b/i,
  /\b(?:auth|bearer)[_ -]?token\b/i,
  /\bprivate[_ -]?key\b/i,
  /\bclient[_ -]?secret\b/i,
  /\bcredit ?card\b/i,
  /\bcvv\b|\bcvc\b/i,
  /\bssn\b|\bsocial security\b/i,
  /\brouting number\b|\bbank account\b/i,
  /\b\d{13,19}\b/, // contiguous digit run long enough to be a card/account number
  /\b[A-Za-z0-9_-]{32,}\b/, // opaque high-entropy token/key shape (sk-…, ghp_…, JWTs, hex/base64 secrets)
];

function isSecretShaped(text: string): boolean {
  return SECRET_SHAPED_PATTERNS.some((re) => re.test(text));
}

// Lazy captures stop at sentence punctuation or a coordinating conjunction
// so "my language is English and please call me Captain" doesn't swallow
// the second clause into the first extracted fact. STOP_KEEP_COMMA omits
// the comma boundary for values that legitimately contain one (e.g. "Austin, Texas").
const STOP = "(?=[.,!?;]|\\s+(?:and|but|so|because|please|then)\\b|$)";
const STOP_KEEP_COMMA = "(?=[.!?;]|\\s+(?:and|but|so|because|please|then)\\b|$)";

/**
 * Deliberately narrow, explicit-pattern extraction — this is NOT "store
 * every message the user sends." Only fires when the user states
 * something stable and useful (a preference, a fact about themselves, an
 * explicit "remember this") in a recognizable form. Anything not matching
 * one of these patterns is left alone; conversational chatter never
 * becomes a permanent memory.
 */
const PATTERNS: ExtractionPattern[] = [
  {
    regex: new RegExp(`\\bmy (?:preferred )?language is ([a-z][a-z .-]*?)${STOP}`, "i"),
    type: "PREFERENCE",
    importance: 0.7,
    confidence: 0.9,
    format: (m) => `Preferred language: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\b(?:please )?call me ([a-z0-9][a-z0-9 '-]*?)${STOP}`, "i"),
    type: "USER_PROFILE",
    importance: 0.8,
    confidence: 0.95,
    format: (m) => `Prefers to be addressed as "${m[1].trim()}".`,
  },
  {
    regex: new RegExp(`\\bmy name is ([a-z0-9][a-z0-9 '-]*?)${STOP}`, "i"),
    type: "USER_PROFILE",
    importance: 0.8,
    confidence: 0.95,
    format: (m) => `Name: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bi prefer ([^.!?\\n]*?)${STOP}`, "i"),
    type: "PREFERENCE",
    importance: 0.6,
    confidence: 0.75,
    format: (m) => `Preference: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bremember (?:that )?([^.!?\\n]*?)${STOP}`, "i"),
    type: "FACT",
    importance: 0.75,
    confidence: 0.9,
    format: (m) => m[1].trim().replace(/^./, (c) => c.toUpperCase()),
  },
  {
    regex: new RegExp(`\\bi(?:'m| am) working on ([^.!?\\n]*?)${STOP}`, "i"),
    type: "TASK",
    importance: 0.65,
    confidence: 0.85,
    format: (m) => `Working on: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bi live in ([a-z0-9][a-z0-9 ,'-]*?)${STOP_KEEP_COMMA}`, "i"),
    type: "USER_PROFILE",
    importance: 0.6,
    confidence: 0.85,
    format: (m) => `Location: ${m[1].trim()}.`,
  },
  {
    regex: /\bmy (?:timezone|time ?zone) is ([a-z0-9/_+-]{2,40})/i,
    type: "PREFERENCE",
    importance: 0.6,
    confidence: 0.95,
    format: (m) => `Timezone: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bi(?:'m| am) (?:a|an) ([a-z][a-z -]*?)${STOP}`, "i"),
    type: "USER_PROFILE",
    importance: 0.55,
    confidence: 0.6,
    format: (m) => `Profession/role: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bdon'?t (?:call me|address me as) ([a-z0-9][a-z0-9 '-]*?)${STOP}`, "i"),
    type: "PREFERENCE",
    importance: 0.65,
    confidence: 0.9,
    format: (m) => `Does not want to be addressed as "${m[1].trim()}".`,
  },
];

export function extractMemoriesFromText(text: string): ExtractedMemory[] {
  const results: ExtractedMemory[] = [];
  const seen = new Set<string>();
  for (const pattern of PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match || !match[1]?.trim()) continue;
    const content = pattern.format(match);
    // Never persist anything credential/financial-secret-shaped, even if a
    // legitimate-looking pattern happened to capture it.
    if (isSecretShaped(content) || isSecretShaped(match[1])) continue;
    const key = `${pattern.type}:${content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ type: pattern.type, content, importance: pattern.importance, confidence: pattern.confidence });
  }
  return results;
}
