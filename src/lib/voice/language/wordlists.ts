/**
 * Small, hand-curated keyword lists driving the Latin-script classifier in
 * detect.ts. Deliberately a heuristic (matching this codebase's existing
 * lib/ai/router.ts intent classifier and lib/planning/planner.ts STAGE_SIGNALS
 * house style) rather than a trained model or a third-party language-ID
 * call — no extra provider/latency/cost for a decision this codebase can
 * make honestly and fast with a keyword pass. AssemblyAI's own real
 * per-utterance language detection (see stt/assemblyai.ts) still handles
 * the arabic/devanagari-script cases; this list only exists to tell Roman
 * Urdu, Hinglish, and English apart on Latin script, which no off-the-shelf
 * STT language code does.
 */

/** Function/grammar words and common native verbs that mark a Latin-script
 * sentence as Urdu/Hindi in Roman transliteration, regardless of whether it
 * also borrows English nouns (system, memory, meeting — normal vocabulary
 * for a Roman Urdu speaker, not evidence of Hinglish by itself). */
export const ROMAN_SOUTH_ASIAN_MARKERS = new Set([
  "hai", "hain", "hoon", "ho", "tha", "thi", "the",
  "ka", "ki", "ke", "ko", "se", "mein", "main", "par", "pe",
  "hum", "tum", "aap", "mujhe", "tumhe", "unhe", "usay", "unko", "hamein",
  "kya", "kyun", "kyu", "kaisay", "kaisa", "kaisi", "kahan", "kab", "kaun", "kitna", "kitni", "kitne",
  "nahi", "nahin", "haan", "han", "bilkul", "zaroor", "shayad",
  "bhi", "bhai", "yaar", "acha", "accha", "theek", "thik",
  "chalao", "chala", "chalado", "batao", "bata", "dikhao", "dikha",
  "karo", "kar", "karen", "kijiye", "karta", "karti", "karna", "kiya", "kro",
  "dena", "dila", "de", "den", "lena", "le", "len",
  "subah", "shaam", "raat", "aaj", "kal", "abhi", "phir", "baje",
  "wala", "wali", "waley", "yaad", "shukriya", "meherbani",
  "chahiye", "chahye", "please", // "please" is common in loan use, kept low-weight by not double counting
]);

/** English verbs that, when directly followed by a South Asian auxiliary
 * marker (karo/kar do/karen/kijiye/...), signal a genuine code-switch —
 * the hallmark of Hinglish ("run karo", "check kar do") as opposed to a
 * Roman Urdu sentence that just borrows English nouns. */
export const ENGLISH_CODE_SWITCH_VERBS = new Set([
  "run", "check", "save", "delete", "update", "create", "install", "restart",
  "download", "upload", "share", "send", "open", "close", "start", "stop",
  "cancel", "search", "remind", "set", "show", "scan", "test", "backup",
]);

export const URDU_HINDI_AUX_FOLLOWERS = new Set([
  "karo", "kar", "karen", "kijiye", "karta", "karti", "karna", "kiya", "kro", "do", "den",
]);
