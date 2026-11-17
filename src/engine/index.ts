import { buildInfixEvalSteps, buildPostfixEvalSteps, buildPrefixEvalSteps } from './evaluators';
import { buildPrefixConversionSteps } from './prefixConverter';
import { buildShuntingYardSteps } from './shuntingYard';
import { tokenizeAndValidate } from './tokenizer';
import { buildExpressionTree, buildTreeTraversalSteps } from './treeBuilder';
import {
  ExprNode,
  InfixEvalStep,
  PrefixConversionStep,
  ShuntingYardStep,
  StackEvalStep,
  Token,
  TreeTraversalStep,
  ValidationResult,
  VariableMap,
} from './types';

export * from './types';
export * from './precedence';
export * from './tokenizer';
export * from './shuntingYard';
export * from './prefixConverter';
export * from './treeBuilder';
export * from './evaluators';

export interface ExpressionAnalysis {
  validation: ValidationResult;
  infixTokens: Token[];
  postfixTokens: Token[];
  prefixTokens: Token[];
  shuntingYardSteps: ShuntingYardStep[];
  prefixConversionSteps: PrefixConversionStep[];
  treeRoot: ExprNode | null;
  traversals: {
    inorder: TreeTraversalStep[];
    preorder: TreeTraversalStep[];
    postorder: TreeTraversalStep[];
  };
  evaluations: {
    infix: InfixEvalStep[];
    prefix: StackEvalStep[];
    postfix: StackEvalStep[];
  };
}

export const PRESET_EXPRESSIONS: Array<{ label: string; expression: string; hint: string }> = [
  {
    label: '3 + 4 * 2',
    expression: '3 + 4 * 2',
    hint: 'Precedence: × before +',
  },
  {
    label: '(A + B) * C',
    expression: '(A + B) * C',
    hint: 'Parentheses & variables',
  },
  {
    label: '(5 + 3) * (2 - 1) ^ 2',
    expression: '(5 + 3) * (2 - 1) ^ 2',
    hint: 'Grouping & exponent',
  },
  {
    label: 'A + B * C - D / E',
    expression: 'A + B * C - D / E',
    hint: 'Multi-operator chain',
  },
];

export const DEFAULT_VARIABLES: VariableMap = {
  A: 5,
  B: 3,
  C: 2,
  D: 8,
  E: 4,
  F: 6,
  X: 4,
  Y: 2,
  Z: 3,
};

/**
 * Full pipeline: validates input, computes Postfix & Prefix conversions,
 * constructs the Expression Tree + all 3 traversals, and generates step-by-step
 * evaluation snapshots for Infix, Prefix, and Postfix.
 */
export function analyzeExpression(rawInput: string, variables: VariableMap): ExpressionAnalysis {
  const validation = tokenizeAndValidate(rawInput);

  if (!validation.valid) {
    return {
      validation,
      infixTokens: [],
      postfixTokens: [],
      prefixTokens: [],
      shuntingYardSteps: [],
      prefixConversionSteps: [],
      treeRoot: null,
      traversals: { inorder: [], preorder: [], postorder: [] },
      evaluations: { infix: [], prefix: [], postfix: [] },
    };
  }

  const infixTokens = validation.tokens;
  const { postfix: postfixTokens, steps: shuntingYardSteps } = buildShuntingYardSteps(infixTokens);
  const { prefix: prefixTokens, steps: prefixConversionSteps } = buildPrefixConversionSteps(infixTokens);
  const treeRoot = buildExpressionTree(postfixTokens);

  const inorder = buildTreeTraversalSteps(treeRoot, 'inorder');
  const preorder = buildTreeTraversalSteps(treeRoot, 'preorder');
  const postorder = buildTreeTraversalSteps(treeRoot, 'postorder');

  const postfixEval = buildPostfixEvalSteps(postfixTokens, variables);
  const prefixEval = buildPrefixEvalSteps(prefixTokens, variables);
  const infixEval = buildInfixEvalSteps(treeRoot, variables);

  return {
    validation,
    infixTokens,
    postfixTokens,
    prefixTokens,
    shuntingYardSteps,
    prefixConversionSteps,
    treeRoot,
    traversals: { inorder, preorder, postorder },
    evaluations: {
      infix: infixEval,
      prefix: prefixEval,
      postfix: postfixEval,
    },
  };
}
