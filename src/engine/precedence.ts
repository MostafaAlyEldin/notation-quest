import { OperatorSymbol, PrecedenceInfo } from './types';

/**
 * Operator precedence & associativity table.
 * Higher precedence numbers bind more tightly than lower ones.
 */
export const PRECEDENCE_TABLE: Record<OperatorSymbol, PrecedenceInfo> = {
  '^': {
    operator: '^',
    display: '^',
    precedence: 4,
    associativity: 'RIGHT',
    name: 'Exponentiation',
  },
  '*': {
    operator: '*',
    display: '×',
    precedence: 3,
    associativity: 'LEFT',
    name: 'Multiplication',
  },
  '/': {
    operator: '/',
    display: '÷',
    precedence: 3,
    associativity: 'LEFT',
    name: 'Division',
  },
  '+': {
    operator: '+',
    display: '+',
    precedence: 2,
    associativity: 'LEFT',
    name: 'Addition',
  },
  '-': {
    operator: '-',
    display: '−',
    precedence: 2,
    associativity: 'LEFT',
    name: 'Subtraction',
  },
};

export const PRECEDENCE_ROWS: PrecedenceInfo[] = [
  PRECEDENCE_TABLE['^'],
  PRECEDENCE_TABLE['*'],
  PRECEDENCE_TABLE['/'],
  PRECEDENCE_TABLE['+'],
  PRECEDENCE_TABLE['-'],
];

export function isOperatorSymbol(char: string): char is OperatorSymbol {
  return char === '+' || char === '-' || char === '*' || char === '/' || char === '^';
}

export function getDisplayOperator(op: string): string {
  if (op === '*') return '×';
  if (op === '/') return '÷';
  if (op === '-') return '−';
  return op;
}

export function getPrecedence(op: string): number {
  if (isOperatorSymbol(op)) {
    return PRECEDENCE_TABLE[op].precedence;
  }
  return 0;
}

export function getAssociativity(op: string): 'LEFT' | 'RIGHT' {
  if (isOperatorSymbol(op)) {
    return PRECEDENCE_TABLE[op].associativity;
  }
  return 'LEFT';
}

/**
 * Formats numbers cleanly for educational display (avoids floating-point noise like 0.30000000000000004).
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Undefined';
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

/**
 * Evaluates a single binary arithmetic operation safely.
 */
export function applyOperator(
  left: number,
  right: number,
  operator: OperatorSymbol
): { ok: true; value: number } | { ok: false; error: string } {
  switch (operator) {
    case '+':
      return { ok: true, value: left + right };
    case '-':
      return { ok: true, value: left - right };
    case '*':
      return { ok: true, value: left * right };
    case '/':
      if (right === 0) {
        return { ok: false, error: `Division by zero (${formatNumber(left)} ÷ 0) is undefined.` };
      }
      return { ok: true, value: left / right };
    case '^': {
      const powered = Math.pow(left, right);
      if (!Number.isFinite(powered)) {
        return { ok: false, error: `Exponent ${formatNumber(left)} ^ ${formatNumber(right)} exceeds numeric bounds.` };
      }
      return { ok: true, value: powered };
    }
  }
}
