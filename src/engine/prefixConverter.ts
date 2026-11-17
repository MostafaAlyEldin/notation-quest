import { buildShuntingYardSteps } from './shuntingYard';
import { PrefixConversionStep, Token } from './types';

/**
 * Converts Infix tokens to Prefix (Polish) notation using the classic 4-stage method:
 *   Stage 1: Reverse the Infix token sequence
 *   Stage 2: Swap '(' with ')' and ')' with '('
 *   Stage 3: Run modified Shunting-Yard (flips equal-precedence tie-breaking)
 *   Stage 4: Reverse the resulting Postfix sequence to get Prefix
 *
 * Records every stage and Shunting-Yard step as a navigable snapshot.
 */
export function buildPrefixConversionSteps(tokens: Token[]): {
  prefix: Token[];
  steps: PrefixConversionStep[];
} {
  const steps: PrefixConversionStep[] = [];

  // Stage 0: Original Infix
  steps.push({
    stepIndex: steps.length,
    stage: 'ORIGINAL',
    stageTitle: 'Original Infix Expression',
    tokensView: [...tokens],
    currentTokenIndex: null,
    stack: [],
    output: [],
    explanation: `Start with the original Infix tokens: ${tokens.map((t) => t.display).join(' ')}`,
  });

  // Stage 1: Reverse the tokens
  const reversedTokens: Token[] = [...tokens].reverse();
  steps.push({
    stepIndex: steps.length,
    stage: 'REVERSED',
    stageTitle: 'Stage 1 · Reverse Infix Tokens',
    tokensView: [...reversedTokens],
    currentTokenIndex: null,
    stack: [],
    output: [],
    explanation: `Reverse the token order left-to-right → ${reversedTokens.map((t) => t.display).join(' ')}`,
  });

  // Stage 2: Swap '(' and ')'
  const swappedTokens: Token[] = reversedTokens.map((tok) => {
    if (tok.type === 'LPAREN') {
      return { ...tok, type: 'RPAREN', value: ')', display: ')' };
    }
    if (tok.type === 'RPAREN') {
      return { ...tok, type: 'LPAREN', value: '(', display: '(' };
    }
    return tok;
  });

  const hasParens = tokens.some((t) => t.type === 'LPAREN' || t.type === 'RPAREN');
  steps.push({
    stepIndex: steps.length,
    stage: 'SWAPPED_PARENS',
    stageTitle: 'Stage 2 · Swap Parentheses',
    tokensView: [...swappedTokens],
    currentTokenIndex: null,
    stack: [],
    output: [],
    explanation: hasParens
      ? `Swap every "(" and ")" so grouped sub-expressions remain balanced → ${swappedTokens.map((t) => t.display).join(' ')}`
      : 'No parentheses to swap — token stream remains unchanged.',
  });

  // Stage 3: Modified Shunting-Yard on the reversed+swapped stream
  const { postfix: intermediatePostfix, steps: sySteps } = buildShuntingYardSteps(swappedTokens, {
    reversedMode: true,
  });

  // Skip the synthetic INIT step from sySteps to keep stage transition crisp
  for (let i = 1; i < sySteps.length; i++) {
    const sy = sySteps[i];
    steps.push({
      stepIndex: steps.length,
      stage: 'POSTFIX_PASS',
      stageTitle: 'Stage 3 · Intermediate Postfix Pass',
      tokensView: [...swappedTokens],
      currentTokenIndex: sy.currentTokenIndex,
      stack: sy.stack,
      output: sy.output,
      explanation: sy.explanation,
    });
  }

  // Stage 4: Reverse the intermediate Postfix output to get Prefix
  const finalPrefix = [...intermediatePostfix].reverse();
  steps.push({
    stepIndex: steps.length,
    stage: 'FINAL_REVERSED',
    stageTitle: 'Stage 4 · Reverse Result for Prefix',
    tokensView: [...swappedTokens],
    currentTokenIndex: null,
    stack: [],
    output: [...finalPrefix],
    explanation: `Reverse the intermediate Postfix (${intermediatePostfix.map((t) => t.display).join(' ')}) → Prefix: ${finalPrefix.map((t) => t.display).join(' ')}`,
  });

  return { prefix: finalPrefix, steps };
}
