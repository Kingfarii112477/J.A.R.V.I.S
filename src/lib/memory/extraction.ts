import type { MemoryType } from "@/types/memory";

export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  importance: number;
}

interface ExtractionPattern {
  regex: RegExp;
  type: MemoryType;
  importance: number;
  format: (match: RegExpMatchArray) => string;
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
    format: (m) => `Preferred language: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\b(?:please )?call me ([a-z0-9][a-z0-9 '-]*?)${STOP}`, "i"),
    type: "USER_PROFILE",
    importance: 0.8,
    format: (m) => `Prefers to be addressed as "${m[1].trim()}".`,
  },
  {
    regex: new RegExp(`\\bmy name is ([a-z0-9][a-z0-9 '-]*?)${STOP}`, "i"),
    type: "USER_PROFILE",
    importance: 0.8,
    format: (m) => `Name: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bi prefer ([^.!?\\n]*?)${STOP}`, "i"),
    type: "PREFERENCE",
    importance: 0.6,
    format: (m) => `Preference: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bremember (?:that )?([^.!?\\n]*?)${STOP}`, "i"),
    type: "FACT",
    importance: 0.75,
    format: (m) => m[1].trim().replace(/^./, (c) => c.toUpperCase()),
  },
  {
    regex: new RegExp(`\\bi(?:'m| am) working on ([^.!?\\n]*?)${STOP}`, "i"),
    type: "TASK",
    importance: 0.65,
    format: (m) => `Working on: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bi live in ([a-z0-9][a-z0-9 ,'-]*?)${STOP_KEEP_COMMA}`, "i"),
    type: "USER_PROFILE",
    importance: 0.6,
    format: (m) => `Location: ${m[1].trim()}.`,
  },
  {
    regex: /\bmy (?:timezone|time ?zone) is ([a-z0-9/_+-]{2,40})/i,
    type: "PREFERENCE",
    importance: 0.6,
    format: (m) => `Timezone: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bi(?:'m| am) (?:a|an) ([a-z][a-z -]*?)${STOP}`, "i"),
    type: "USER_PROFILE",
    importance: 0.55,
    format: (m) => `Profession/role: ${m[1].trim()}.`,
  },
  {
    regex: new RegExp(`\\bdon'?t (?:call me|address me as) ([a-z0-9][a-z0-9 '-]*?)${STOP}`, "i"),
    type: "PREFERENCE",
    importance: 0.65,
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
    const key = `${pattern.type}:${content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ type: pattern.type, content, importance: pattern.importance });
  }
  return results;
}
