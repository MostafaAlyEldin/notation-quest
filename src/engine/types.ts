/**
 * Core types for Notation Quest's expression engine.
 * Every algorithm produces immutable step snapshots so the UI can play
 * animations forward, backward, or scrub directly to any step.
 */

export type TokenType = 'NUMBER' | 'VARIABLE' | 'OPERATOR' | 'LPAREN' | 'RPAREN';

export type OperatorSymbol = '+' | '-' | '*' | '/' | '^';

export type Associativity = 'LEFT' | 'RIGHT';

export type NotationType = 'infix' | 'prefix' | 'postfix';

export interface Token {
  /** Unique ID per token instance so animated stack/queue items can smoothly transition */
  id: string;
  type: TokenType;
  /** Canonical ASCII value (e.g., '*', '/', '-', '+', '^', '42', 'A', '(', ')') */
  value: string;
  /** Human-friendly display symbol (e.g., '×', '÷', '−') */
  display: string;
  /** Character index in normalized input string */
  position: number;
}

export interface ValidationResult {
  valid: boolean;
  tokens: Token[];
  variables: string[];
  normalizedExpression: string;
  error?: string;
}

export type VariableMap = Record<string, number>;

export interface PrecedenceInfo {
  operator: OperatorSymbol;
  display: string;
  precedence: number;
  associativity: Associativity;
  name: string;
}

/**
 * Snapshot produced by the Shunting-Yard (Infix -> Postfix) algorithm.
 */
export type ShuntingYardAction =
  | 'INIT'
  | 'OUTPUT_OPERAND'
  | 'PUSH_OPERATOR'
  | 'POP_OPERATOR'
  | 'PUSH_PAREN'
  | 'POP_PAREN_MATCH'
  | 'FLUSH_STACK'
  | 'COMPLETE';

export interface ShuntingYardStep {
  stepIndex: number;
  action: ShuntingYardAction;
  currentTokenIndex: number | null;
  currentToken: Token | null;
  stack: Token[];
  output: Token[];
  explanation: string;
  ruleHighlight?: OperatorSymbol | 'PAREN' | null;
}

/**
 * Stages for the 4-step Infix -> Prefix conversion method:
 * 1. Reverse the Infix tokens
 * 2. Swap '(' and ')'
 * 3. Run modified Shunting-Yard to produce intermediate Postfix
 * 4. Reverse the intermediate Postfix to obtain Prefix
 */
export type PrefixStage = 'ORIGINAL' | 'REVERSED' | 'SWAPPED_PARENS' | 'POSTFIX_PASS' | 'FINAL_REVERSED';

export interface PrefixConversionStep {
  stepIndex: number;
  stage: PrefixStage;
  stageTitle: string;
  tokensView: Token[];
  currentTokenIndex: number | null;
  stack: Token[];
  output: Token[];
  explanation: string;
}

/**
 * Binary Expression Tree node with precomputed layout coordinates.
 */
export interface ExprNode {
  id: string;
  token: Token;
  left: ExprNode | null;
  right: ExprNode | null;
  /** Normalized horizontal coordinate (0..100) for responsive SVG rendering */
  x: number;
  /** Normalized vertical coordinate (0..100) */
  y: number;
  depth: number;
}

export type TraversalOrder = 'inorder' | 'preorder' | 'postorder';

export type TraversalEvent = 'ENTER' | 'VISIT_LEFT' | 'EMIT' | 'VISIT_RIGHT' | 'EXIT';

export interface TreeTraversalStep {
  stepIndex: number;
  order: TraversalOrder;
  activeNodeId: string | null;
  visitedNodeIds: string[];
  emittedNodeIds: string[];
  event: TraversalEvent;
  /** Tokens emitted so far (for Inorder, includes grouping parentheses) */
  outputTokens: string[];
  explanation: string;
}

/**
 * Evaluation snapshots for Postfix, Prefix, and Infix.
 */
export interface StackOperandItem {
  id: string;
  value: number;
  label: string;
  isResult?: boolean;
}

export interface CalculationLogEntry {
  stepNumber: number;
  notation: NotationType;
  expression: string;
  result: number;
  detail: string;
}

export type StackEvalAction = 'INIT' | 'PUSH_VALUE' | 'COMPUTE' | 'COMPLETE' | 'ERROR';

export interface StackEvalStep {
  stepIndex: number;
  notation: 'postfix' | 'prefix';
  action: StackEvalAction;
  currentTokenIndex: number | null;
  currentToken: Token | null;
  stack: StackOperandItem[];
  activeCalculation: {
    left: number;
    right: number;
    operator: string;
    result: number;
    summary: string;
  } | null;
  explanation: string;
  logSoFar: CalculationLogEntry[];
  finalResult: number | null;
  error?: string;
}

export interface InfixEvalStep {
  stepIndex: number;
  /** Expression segments so the UI can highlight the exact sub-expression being solved */
  segments: Array<{
    text: string;
    isHighlighted: boolean;
  }>;
  activeCalculation: {
    left: number;
    right: number;
    operator: string;
    result: number;
    summary: string;
  } | null;
  explanation: string;
  logSoFar: CalculationLogEntry[];
  finalResult: number | null;
  error?: string;
}
