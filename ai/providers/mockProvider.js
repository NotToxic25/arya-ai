/**
 * ai/providers/mockProvider.js
 *
 * A deterministic, fully offline provider with NO network calls and NO
 * API key of any kind. It exists to:
 *   1. Let the app run end-to-end (chat + tool-calling loop) with zero
 *      external dependencies, satisfying "free-first" and "no exposed
 *      key" at the same time.
 *   2. Prove the AIProvider interface and the tool-calling loop actually
 *      work, without pretending to be a real language model.
 *
 * It is NOT an AI. It uses simple pattern matching only. Every response
 * it generates says so explicitly, so the UI never misrepresents it as a
 * real LLM reply — this is required by the "never pretend to perform
 * actions it did not actually execute" rule applied to *capability*
 * honesty as well as actions.
 */
import { AIProvider } from '../AIProvider.js';

const ARITHMETIC_RE = /^[\s\d+\-*/().]+$/;
const CALC_PHRASE_RE = /(?:calculate|compute|what(?:'s| is))\s+([\d\s+\-*/().]+)/i;

export class MockProvider extends AIProvider {
  constructor(opts = {}) {
    super({ name: 'mock', supportsStreaming: true, requiresNetwork: false, requiresBackend: false, ...opts });
  }

  async generateResponse(messages, options = {}) {
    const tools = options.tools ?? [];

    // Check this FIRST: if the most recent message is already a tool
    // result, summarize it rather than deciding (again) whether the
    // original user text looks like arithmetic — otherwise the provider
    // would re-request the same tool call forever.
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'tool') {
      let parsed;
      try {
        parsed = JSON.parse(lastMsg.content);
      } catch {
        parsed = null;
      }
      const resultText = parsed && 'result' in parsed ? String(parsed.result) : lastMsg.content;
      return {
        role: 'assistant',
        content: `Result: ${resultText} (via the "${lastMsg.name}" tool). [Offline demo provider — not a real AI model.]`,
        toolCalls: null,
        raw: { mock: true, matchedRule: 'tool-result-summary' },
      };
    }

    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const text = lastUser?.content?.trim() ?? '';

    const hasCalculator = tools.some((t) => t.name === 'calculator');
    const expr = extractExpression(text);

    if (hasCalculator && expr) {
      return {
        role: 'assistant',
        content: null,
        toolCalls: [{ id: `call_${Date.now()}`, name: 'calculator', arguments: { expression: expr } }],
        raw: { mock: true, matchedRule: 'arithmetic' },
      };
    }

    return {
      role: 'assistant',
      content:
        `Main abhi ek offline demo provider hoon — koi real AI backend connected nahi hai. ` +
        `Aapne likha: "${text}". Jab aap Settings me ek secure backend proxy configure karenge, ` +
        `tab real AI replies is architecture ke through kaam karengi. [Offline demo provider — not a real AI model.]`,
      toolCalls: null,
      raw: { mock: true, matchedRule: 'echo' },
    };
  }
}

function extractExpression(text) {
  if (!text) return null;
  if (ARITHMETIC_RE.test(text) && /[\d]/.test(text) && /[+\-*/]/.test(text)) {
    return text.trim();
  }
  const m = text.match(CALC_PHRASE_RE);
  if (m) return m[1].trim();
  return null;
}

export default MockProvider;
