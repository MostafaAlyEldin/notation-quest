import { getDisplayOperator, isOperatorSymbol } from './precedence';
import { Token, ValidationResult } from './types';

/**
 * Normalizes Unicode arithmetic characters (×, ÷, −) into canonical ASCII (+, -, *, /, ^).
 */
export function normalizeExpression(raw: string): string {
  return raw
    .replace(/×|·/g, '*')
    .replace(/÷/g, '/')
    .replace(/−|–|—/g, '-')
    .trim();
}

/**
 * Tokenizes and validates an infix arithmetic expression.
 *
 * Supported rules:
 * - Multi-digit non-negative integers (e.g. 3, 42, 100)
 * - Single-letter variables (A–Z, case-insensitive, normalized to uppercase)
 * - Binary operators: + - * / ^ (and × ÷ −)
 * - Parentheses: ( and )
 *
 * Returns friendly, actionable error messages when syntax is invalid.
 */
export function tokenizeAndValidate(rawInput: string): ValidationResult {
  const normalized = normalizeExpression(rawInput);

  if (!normalized) {
    return {
      valid: false,
      tokens: [],
      variables: [],
      normalizedExpression: '',
      error: 'Enter an arithmetic expression (for example, 3 + 4 * 2 or (A + B) * C).',
    };
  }

  const tokens: Token[] = [];
  const variableSet = new Set<string>();
  let i = 0;
  let tokenCounter = 0;

  while (i < normalized.length) {
    const ch = normalized[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Integer literal
    if (/[0-9]/.test(ch)) {
      const start = i;
      let numStr = '';
      while (i < normalized.length && /[0-9]/.test(normalized[i])) {
        numStr += normalized[i];
        i++;
      }
      if (normalized[i] === '.') {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: 'Expressions use whole integers or single-letter variables (decimals are not needed in input).',
        };
      }
      tokens.push({
        id: `tok-${tokenCounter++}`,
        type: 'NUMBER',
        value: numStr,
        display: numStr,
        position: start,
      });
      continue;
    }

    // Single-letter variable (A-Z)
    if (/[a-zA-Z]/.test(ch)) {
      const upper = ch.toUpperCase();
      // Reject multi-letter identifiers like "AB" or "sin" with a friendly explanation
      if (i + 1 < normalized.length && /[a-zA-Z]/.test(normalized[i + 1])) {
        const wordMatch = normalized.slice(i).match(/^[a-zA-Z]+/);
        const word = wordMatch ? wordMatch[0] : ch;
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: `Found "${word}". Use single-letter variables separated by operators, such as ${word[0].toUpperCase()} * ${word[1].toUpperCase()}.`,
        };
      }
      variableSet.add(upper);
      tokens.push({
        id: `tok-${tokenCounter++}`,
        type: 'VARIABLE',
        value: upper,
        display: upper,
        position: i,
      });
      i++;
      continue;
    }

    // Operators
    if (isOperatorSymbol(ch)) {
      tokens.push({
        id: `tok-${tokenCounter++}`,
        type: 'OPERATOR',
        value: ch,
        display: getDisplayOperator(ch),
        position: i,
      });
      i++;
      continue;
    }

    // Left parenthesis
    if (ch === '(') {
      tokens.push({
        id: `tok-${tokenCounter++}`,
        type: 'LPAREN',
        value: '(',
        display: '(',
        position: i,
      });
      i++;
      continue;
    }

    // Right parenthesis
    if (ch === ')') {
      tokens.push({
        id: `tok-${tokenCounter++}`,
        type: 'RPAREN',
        value: ')',
        display: ')',
        position: i,
      });
      i++;
      continue;
    }

    // Invalid character
    return {
      valid: false,
      tokens: [],
      variables: [],
      normalizedExpression: normalized,
      error: `Invalid character "${ch}". Only integers, letters (A–Z), operators (+ − × ÷ ^), and parentheses are supported.`,
    };
  }

  // Grammar & structural validation
  let parenBalance = 0;

  for (let idx = 0; idx < tokens.length; idx++) {
    const curr = tokens[idx];
    const prev = idx > 0 ? tokens[idx - 1] : null;
    const isOperand = (t: Token) => t.type === 'NUMBER' || t.type === 'VARIABLE';

    if (curr.type === 'LPAREN') {
      parenBalance++;
      if (prev && (isOperand(prev) || prev.type === 'RPAREN')) {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: `Missing operator between "${prev.display}" and "(". Write "${prev.display} * (" instead.`,
        };
      }
    } else if (curr.type === 'RPAREN') {
      parenBalance--;
      if (parenBalance < 0) {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: 'Mismatched parentheses: found an extra closing ")" without a matching "(".',
        };
      }
      if (prev && prev.type === 'LPAREN') {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: 'Empty parentheses "()" have no expression inside.',
        };
      }
      if (prev && prev.type === 'OPERATOR') {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: `Missing operand after "${prev.display}" before ")".`,
        };
      }
    } else if (curr.type === 'OPERATOR') {
      if (!prev) {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: `Expression cannot start with operator "${curr.display}". Every binary operator needs an operand before it.`,
        };
      }
      if (prev.type === 'OPERATOR') {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: `Two operators in a row ("${prev.display}" followed by "${curr.display}"). Place an operand or parentheses between them.`,
        };
      }
      if (prev.type === 'LPAREN') {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: `Missing operand before "${curr.display}" inside parentheses.`,
        };
      }
    } else if (isOperand(curr)) {
      if (prev && (isOperand(prev) || prev.type === 'RPAREN')) {
        return {
          valid: false,
          tokens: [],
          variables: [],
          normalizedExpression: normalized,
          error: `Missing operator between "${prev.display}" and "${curr.display}".`,
        };
      }
    }
  }

  if (parenBalance > 0) {
    return {
      valid: false,
      tokens: [],
      variables: [],
      normalizedExpression: normalized,
      error: `Mismatched parentheses: ${parenBalance} opening "(" ${parenBalance === 1 ? 'is' : 'are'} missing a closing ")".`,
    };
  }

  const last = tokens[tokens.length - 1];
  if (last && last.type === 'OPERATOR') {
    return {
      valid: false,
      tokens: [],
      variables: [],
      normalizedExpression: normalized,
      error: `Missing right-hand operand after trailing "${last.display}".`,
    };
  }

  return {
    valid: true,
    tokens,
    variables: Array.from(variableSet).sort(),
    normalizedExpression: tokens.map((t) => t.display).join(' '),
  };
}
