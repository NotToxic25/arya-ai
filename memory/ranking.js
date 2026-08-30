/**
 * memory/ranking.js
 * Simple, explainable relevance scoring for long-term memory retrieval
 * (Phase 3 acceptance criterion: "keyword match, recency, or simple
 * relevance scoring is acceptable").
 */

export function tokenize(text) {
  return (text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} query
 * @param {Object} memory - { content, tags, createdAt, lastUsedAt, useCount }
 * @param {number} [now]
 * @returns {{ score: number, reasons: string[] }}
 */
export function scoreMemory(query, memory, now = Date.now()) {
  const queryTokens = new Set(tokenize(query));
  const memoryTokens = tokenize(memory.content);
  const matchedKeywords = [...new Set(memoryTokens.filter((t) => queryTokens.has(t)))];

  let score = matchedKeywords.length * 3;
  const reasons = [];
  if (matchedKeywords.length) {
    reasons.push(`keyword match: ${matchedKeywords.join(', ')}`);
  }

  const tagMatches = (memory.tags || []).filter((t) => queryTokens.has(String(t).toLowerCase()));
  if (tagMatches.length) {
    score += tagMatches.length * 4;
    reasons.push(`tag match: ${tagMatches.join(', ')}`);
  }

  // Recency/frequency only ever BOOST an already-relevant memory (one with
  // at least one keyword or tag match). They must never manufacture
  // relevance for a memory with zero topical connection to the query —
  // otherwise every freshly-created memory would rank as "relevant" to
  // any query purely by being new, which isn't explainable relevance.
  if (score > 0) {
    const lastUsedMs = memory.lastUsedAt ? new Date(memory.lastUsedAt).getTime() : new Date(memory.createdAt).getTime();
    const ageMs = now - lastUsedMs;
    if (ageMs < DAY_MS) {
      score += 2;
      reasons.push('recently referenced (within a day)');
    } else if (ageMs < 7 * DAY_MS) {
      score += 1;
      reasons.push('referenced this week');
    }

    if (memory.useCount > 0) {
      score += Math.min(memory.useCount, 5) * 0.5;
      reasons.push(`used ${memory.useCount} time(s) before`);
    }
  }

  return { score, reasons };
}

/**
 * @param {string} query
 * @param {Array} memories
 * @param {Object} [opts]
 * @param {number} [opts.limit]
 * @param {number} [opts.now]
 * @returns {Array<{memory, score, reasons}>} sorted by descending score, zero-score entries excluded
 */
export function rankMemories(query, memories, { limit = 5, now = Date.now() } = {}) {
  return memories
    .map((memory) => ({ memory, ...scoreMemory(query, memory, now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export default rankMemories;
