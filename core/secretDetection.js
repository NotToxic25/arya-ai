/**
 * core/secretDetection.js
 *
 * Heuristic detector used to refuse storing anything that looks like an
 * API key, password, or auth token — required for memory (Phase 3) and
 * reusable anywhere else that accepts free-text user content for storage.
 *
 * This is a heuristic, not a guarantee. It is deliberately conservative
 * (biased toward false positives) because the cost of accidentally
 * storing a real secret is much higher than the cost of asking the user
 * to rephrase a false-positive memory.
 */

const KNOWN_PREFIXES = [
  /\bsk-[A-Za-z0-9]{10,}\b/, // OpenAI-style secret keys
  /\bpk_(live|test)_[A-Za-z0-9]{10,}\b/i, // Stripe-style keys
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, // GitHub tokens
  /\bAIza[0-9A-Za-z\-_]{20,}\b/, // Google API keys
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, // Slack tokens
  /\bAKIA[0-9A-Z]{12,}\b/, // AWS access key id
];

const KEYWORD_ASSIGNMENT_RE =
  /\b(api[_-]?key|secret(?:[_-]?key)?|password|passwd|pwd|auth(?:orization)?[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?key|bearer)\b\s*[:=]\s*\S{4,}/i;

const BEARER_HEADER_RE = /\bBearer\s+[A-Za-z0-9\-_.]{10,}\b/;

// Three dot-separated base64url segments — a JWT shape.
const JWT_RE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/;

// A single long token-looking word with mixed letters+digits and no
// spaces — a generic catch-all for opaque secrets that don't match a
// known vendor prefix.
const GENERIC_TOKEN_RE = /\b(?=[A-Za-z0-9_-]{24,}\b)(?=[A-Za-z0-9_-]*[0-9])(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/;

/**
 * @param {string} text
 * @returns {{ isSecret: boolean, reason: string|null }}
 */
export function isLikelySecret(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { isSecret: false, reason: null };
  }

  for (const re of KNOWN_PREFIXES) {
    if (re.test(text)) return { isSecret: true, reason: 'matches a known API key/token format' };
  }
  if (KEYWORD_ASSIGNMENT_RE.test(text)) {
    return { isSecret: true, reason: 'looks like a "key/password/token = value" assignment' };
  }
  if (BEARER_HEADER_RE.test(text)) {
    return { isSecret: true, reason: 'contains a Bearer authorization token' };
  }
  if (JWT_RE.test(text)) {
    return { isSecret: true, reason: 'matches a JWT-style token shape' };
  }
  if (GENERIC_TOKEN_RE.test(text)) {
    return { isSecret: true, reason: 'contains a long opaque token-like string' };
  }
  return { isSecret: false, reason: null };
}

export default isLikelySecret;
