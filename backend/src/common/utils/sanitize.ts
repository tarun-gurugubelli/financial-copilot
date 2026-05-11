/**
 * Strip prompt-injection patterns from user-derived content
 * before it is included in any OpenAI request.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /---+/g,
  /###/g,
  /SYSTEM:/gi,
  /<\|im_start\|>/g,
  /<\|im_end\|>/g,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /\bignore\s+(?:all\s+)?previous\s+instructions?\b/gi,
  /\bforget\s+(?:all\s+)?previous\b/gi,
  /\bact\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:an?\s+)?(?:ai|assistant|gpt)\b/gi,
];

/**
 * Sanitize a string for use in an LLM prompt.
 *
 * @param input     Raw string (email subject, body, merchant name, etc.)
 * @param maxLength Maximum number of characters to keep (default 4000)
 */
export function sanitizeForPrompt(input: string, maxLength = 4000): string {
  if (!input) return '';
  let clean = input;
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '');
  }
  return clean.slice(0, maxLength).trim();
}
