export type IntentCategory =
  | "CONVERSATION"
  | "REASONING"
  | "CODING"
  | "RESEARCH"
  | "AUTOMATION"
  | "SYSTEM"
  | "MEMORY"
  | "VOICE"
  | "NAVIGATION";

interface IntentRule {
  category: IntentCategory;
  test: RegExp;
}

// Order matters — first match wins, so more specific categories are
// listed before the broad catch-all "explain/why" reasoning rule.
const RULES: IntentRule[] = [
  { category: "VOICE", test: /\b(stop talking|be quiet|mute|speak (slower|faster)|repeat that|say that again)\b/i },
  { category: "NAVIGATION", test: /^(open|go to|show me|navigate to)\b/i },
  { category: "SYSTEM", test: /\b(diagnostic|system status|reboot|restart|security check|protocol|subsystem|radar|telemetry)\b/i },
  { category: "MEMORY", test: /\b(remember|recall|memory|forget|what do you know about me)\b/i },
  { category: "AUTOMATION", test: /\b(automat|workflow|trigger .*routine|schedule|n8n)\b/i },
  { category: "RESEARCH", test: /\b(search|research|look up|find information|latest news|current events)\b/i },
  { category: "CODING", test: /\b(code|function|bug|debug|refactor|typescript|javascript|python|regex|stack trace|compile)\b/i },
  { category: "REASONING", test: /\b(why|explain|analy[sz]e|compare|pros and cons|reasoning|trade-?offs?)\b/i },
];

/**
 * Lightweight, deterministic keyword classifier — not a model call, so it
 * costs nothing and never contradicts itself between requests. Used both
 * to pick a per-intent model override (see resolveAIStream) and, on the
 * client, purely for observability (surfaced via the ai.request event).
 */
export function classifyIntent(text: string): IntentCategory {
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.category;
  }
  return "CONVERSATION";
}
