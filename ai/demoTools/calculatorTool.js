/**
 * ai/demoTools/calculatorTool.js
 *
 * A minimal, safe (no eval/Function) arithmetic tool used only to prove
 * the Phase 2 tool-calling loop end-to-end. Phase 6 builds the real,
 * larger tool system (weather, wikipedia, reminders, etc.).
 */
import { ToolError } from '../../core/errors.js';

const TOKEN_RE = /\s*(\d+(?:\.\d+)?|\+|-|\*|\/|\(|\))\s*/y;

function tokenize(expr) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let idx = 0;
  while (idx < expr.length) {
    TOKEN_RE.lastIndex = idx;
    const m = TOKEN_RE.exec(expr);
    if (!m || m.index !== idx) {
      throw new ToolError(`Unexpected character at position ${idx} in expression: "${expr}"`);
    }
    tokens.push(m[1]);
    idx = TOKEN_RE.lastIndex;
  }
  return tokens;
}

/** Small recursive-descent parser: expr -> term (('+'|'-') term)*; term -> factor (('*'|'/') factor)*; factor -> NUMBER | '(' expr ')' | '-' factor */
function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseFactor() {
    const tok = next();
    if (tok === undefined) throw new ToolError('Unexpected end of expression.');
    if (tok === '-') return -parseFactor();
    if (tok === '(') {
      const value = parseExpr();
      if (next() !== ')') throw new ToolError('Missing closing parenthesis.');
      return value;
    }
    const num = Number(tok);
    if (Number.isNaN(num)) throw new ToolError(`Invalid number token: "${tok}"`);
    return num;
  }

  function parseTerm() {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      if (op === '/') {
        if (rhs === 0) throw new ToolError('Division by zero.');
        value /= rhs;
      } else {
        value *= rhs;
      }
    }
    return value;
  }

  function parseExpr() {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new ToolError('Unexpected trailing tokens in expression.');
  return result;
}

export function evaluateExpression(expr) {
  if (typeof expr !== 'string' || !expr.trim()) {
    throw new ToolError('Expression must be a non-empty string.');
  }
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new ToolError('Expression produced no tokens.');
  return parse(tokens);
}

export const calculatorTool = {
  name: 'calculator',
  description: 'Evaluates a basic arithmetic expression using +, -, *, /, and parentheses. No variables or functions.',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'The arithmetic expression to evaluate, e.g. "12 * (3 + 4)"' },
    },
    required: ['expression'],
  },
  validate(args) {
    if (!args || typeof args.expression !== 'string' || !args.expression.trim()) {
      return 'expression (non-empty string) is required';
    }
    return null;
  },
  async execute({ expression }) {
    const result = evaluateExpression(expression);
    return { expression, result };
  },
};

export function registerDemoTools(registry) {
  registry.register(calculatorTool);
}

export default calculatorTool;
