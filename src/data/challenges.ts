import { analyzeExpression, DEFAULT_VARIABLES, normalizeExpression } from '../engine';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type ChallengeType = 'CONVERT' | 'EVALUATE' | 'DRAG_DROP' | 'STACK_SIM';

export interface GameChallenge {
  id: string;
  level: number;
  difficulty: Difficulty;
  type: ChallengeType;
  title: string;
  prompt: string;
  /** Underlying valid Infix expression used to power answer verification & wrong-answer replay */
  infixExpression: string;
  /** Target notation for Convert / Drag&Drop / Evaluate */
  targetNotation: 'postfix' | 'prefix';
  /** Time allowance in seconds */
  timeLimitSec: number;
  /** Base points before streak/time bonus */
  basePoints: number;
  hint: string;
}

export const GAME_CHALLENGES: GameChallenge[] = [
  // EASY (2 operators, clear precedence)
  {
    id: 'lvl-1',
    level: 1,
    difficulty: 'easy',
    type: 'CONVERT',
    title: 'First Conversion',
    prompt: 'Convert this Infix expression to Postfix (Reverse Polish) notation.',
    infixExpression: '3 + 4 * 2',
    targetNotation: 'postfix',
    timeLimitSec: 45,
    basePoints: 100,
    hint: 'Multiplication has higher precedence than addition, so 4 and 2 multiply first.',
  },
  {
    id: 'lvl-2',
    level: 2,
    difficulty: 'easy',
    type: 'EVALUATE',
    title: 'Postfix Stack Math',
    prompt: 'Evaluate this Postfix expression to a single number.',
    infixExpression: '9 - 2 * 3',
    targetNotation: 'postfix',
    timeLimitSec: 45,
    basePoints: 110,
    hint: 'Scan left-to-right. When you hit an operator, apply it to the previous two numbers.',
  },
  {
    id: 'lvl-3',
    level: 3,
    difficulty: 'easy',
    type: 'DRAG_DROP',
    title: 'Prefix Builder',
    prompt: 'Arrange the tokens into valid Prefix (Polish) notation.',
    infixExpression: '8 / 2 + 5',
    targetNotation: 'prefix',
    timeLimitSec: 50,
    basePoints: 120,
    hint: 'In Prefix, each operator comes right BEFORE its two operands.',
  },

  // MEDIUM (Parentheses & 3–4 operators)
  {
    id: 'lvl-4',
    level: 4,
    difficulty: 'medium',
    type: 'STACK_SIM',
    title: 'Shunting-Yard Pilot',
    prompt: 'Operate the Shunting-Yard stack manually for every token!',
    infixExpression: '(3 + 5) * 2',
    targetNotation: 'postfix',
    timeLimitSec: 75,
    basePoints: 150,
    hint: 'Operands go straight to Output. "(" goes to Stack; ")" pops until "(".',
  },
  {
    id: 'lvl-5',
    level: 5,
    difficulty: 'medium',
    type: 'CONVERT',
    title: 'Parenthesis Override',
    prompt: 'Convert this parenthesized Infix expression to Prefix notation.',
    infixExpression: '(6 + 2) * (5 - 2)',
    targetNotation: 'prefix',
    timeLimitSec: 60,
    basePoints: 150,
    hint: 'The root multiplication sits at the very front, followed by the + group and − group.',
  },
  {
    id: 'lvl-6',
    level: 6,
    difficulty: 'medium',
    type: 'EVALUATE',
    title: 'Reverse Scan Challenge',
    prompt: 'Evaluate this Prefix expression (remember: scan right-to-left!).',
    infixExpression: '8 / 2 + 3 * 4',
    targetNotation: 'prefix',
    timeLimitSec: 60,
    basePoints: 160,
    hint: 'Start from the rightmost numbers and apply each operator as you move left.',
  },

  // HARD (Exponents & long multi-operator chains)
  {
    id: 'lvl-7',
    level: 7,
    difficulty: 'hard',
    type: 'DRAG_DROP',
    title: 'Power & Grouping',
    prompt: 'Arrange the tokens into Postfix notation. Watch exponent precedence!',
    infixExpression: '(5 + 3) * (2 - 1) ^ 2',
    targetNotation: 'postfix',
    timeLimitSec: 75,
    basePoints: 200,
    hint: 'Exponentiation (^) binds tighter than multiplication (×).',
  },
  {
    id: 'lvl-8',
    level: 8,
    difficulty: 'hard',
    type: 'STACK_SIM',
    title: 'Associativity Mastery',
    prompt: 'Run the full Shunting-Yard decisions on a chained expression.',
    infixExpression: '4 + 3 * 2 ^ 2 - 6',
    targetNotation: 'postfix',
    timeLimitSec: 90,
    basePoints: 220,
    hint: 'Pop operators from the stack whenever the incoming operator has lower or equal precedence (for left-assoc).',
  },
  {
    id: 'lvl-9',
    level: 9,
    difficulty: 'hard',
    type: 'CONVERT',
    title: 'Grandmaster Quest',
    prompt: 'Convert this complex expression into Prefix (Polish) notation.',
    infixExpression: '2 ^ 3 ^ 2 - 4 * 5',
    targetNotation: 'prefix',
    timeLimitSec: 80,
    basePoints: 250,
    hint: 'Remember: ^ is RIGHT-associative, so 2 ^ 3 ^ 2 means 2 ^ (3 ^ 2)!',
  },
];

/**
 * Normalizes a user-typed Prefix or Postfix string into space-separated canonical tokens
 * for forgiving comparison (accepts either `*` or `×`, `/` or `÷`, `-` or `−`, and extra spaces,
 * or even compact single-digit spacing if separated properly).
 */
export function normalizeAnswerTokens(raw: string): string[] {
  const norm = normalizeExpression(raw).toUpperCase();
  // Match multi-digit numbers, single letters, or operator symbols even if spaces were omitted around operators
  const matches = norm.match(/\d+|[A-Z]|[+\-*/^]/g);
  return matches ?? [];
}

/**
 * Returns the canonical expected tokens & numeric answer for a challenge.
 */
export function getChallengeSolution(challenge: GameChallenge) {
  const analysis = analyzeExpression(challenge.infixExpression, DEFAULT_VARIABLES);
  const targetTokens =
    challenge.targetNotation === 'postfix' ? analysis.postfixTokens : analysis.prefixTokens;
  const evalSteps =
    challenge.targetNotation === 'postfix'
      ? analysis.evaluations.postfix
      : analysis.evaluations.prefix;
  const finalValue = evalSteps[evalSteps.length - 1]?.finalResult ?? 0;

  return {
    analysis,
    targetTokens,
    targetString: targetTokens.map((t) => t.display).join(' '),
    canonicalValues: targetTokens.map((t) => t.value.toUpperCase()),
    finalValue,
  };
}
