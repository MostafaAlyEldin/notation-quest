import {
  applyOperator,
  formatNumber,
  getAssociativity,
  getDisplayOperator,
  getPrecedence,
  isOperatorSymbol,
} from './precedence';
import {
  CalculationLogEntry,
  ExprNode,
  InfixEvalStep,
  OperatorSymbol,
  StackEvalStep,
  StackOperandItem,
  Token,
  VariableMap,
} from './types';

function resolveOperandValue(token: Token, variables: VariableMap): number {
  if (token.type === 'NUMBER') {
    return Number(token.value);
  }
  if (token.type === 'VARIABLE') {
    return variables[token.value] ?? 1;
  }
  return 0;
}

/**
 * Evaluates a Postfix (Reverse Polish Notation) expression left-to-right
 * using an operand stack, recording every push and binary calculation.
 */
export function buildPostfixEvalSteps(
  postfixTokens: Token[],
  variables: VariableMap
): StackEvalStep[] {
  const steps: StackEvalStep[] = [];
  const stack: StackOperandItem[] = [];
  const log: CalculationLogEntry[] = [];
  let itemCounter = 0;

  steps.push({
    stepIndex: 0,
    notation: 'postfix',
    action: 'INIT',
    currentTokenIndex: null,
    currentToken: null,
    stack: [],
    activeCalculation: null,
    explanation: 'Scan Postfix tokens left-to-right with an empty operand stack.',
    logSoFar: [],
    finalResult: null,
  });

  for (let i = 0; i < postfixTokens.length; i++) {
    const token = postfixTokens[i];

    if (token.type === 'NUMBER' || token.type === 'VARIABLE') {
      const val = resolveOperandValue(token, variables);
      const label =
        token.type === 'VARIABLE' ? `${token.display}=${formatNumber(val)}` : formatNumber(val);

      stack.push({
        id: `op-${itemCounter++}`,
        value: val,
        label,
      });

      steps.push({
        stepIndex: steps.length,
        notation: 'postfix',
        action: 'PUSH_VALUE',
        currentTokenIndex: i,
        currentToken: token,
        stack: [...stack],
        activeCalculation: null,
        explanation:
          token.type === 'VARIABLE'
            ? `Read variable ${token.display} (= ${formatNumber(val)}) → push ${formatNumber(val)} onto operand stack.`
            : `Read number ${formatNumber(val)} → push ${formatNumber(val)} onto operand stack.`,
        logSoFar: [...log],
        finalResult: null,
      });
    } else if (token.type === 'OPERATOR' && isOperatorSymbol(token.value)) {
      if (stack.length < 2) {
        steps.push({
          stepIndex: steps.length,
          notation: 'postfix',
          action: 'ERROR',
          currentTokenIndex: i,
          currentToken: token,
          stack: [...stack],
          activeCalculation: null,
          explanation: `Stack underflow while applying "${token.display}".`,
          logSoFar: [...log],
          finalResult: null,
          error: 'Insufficient operands on stack.',
        });
        return steps;
      }

      // In Postfix, the top of stack is the RIGHT operand; second from top is LEFT
      const rightItem = stack.pop()!;
      const leftItem = stack.pop()!;
      const outcome = applyOperator(leftItem.value, rightItem.value, token.value);

      if (!outcome.ok) {
        steps.push({
          stepIndex: steps.length,
          notation: 'postfix',
          action: 'ERROR',
          currentTokenIndex: i,
          currentToken: token,
          stack: [...stack],
          activeCalculation: null,
          explanation: outcome.error,
          logSoFar: [...log],
          finalResult: null,
          error: outcome.error,
        });
        return steps;
      }

      const res = outcome.value;
      const calcExpr = `${formatNumber(leftItem.value)} ${token.display} ${formatNumber(rightItem.value)}`;
      const summary = `Pop ${formatNumber(rightItem.value)} and ${formatNumber(leftItem.value)} → ${calcExpr} = ${formatNumber(res)}`;

      log.push({
        stepNumber: log.length + 1,
        notation: 'postfix',
        expression: calcExpr,
        result: res,
        detail: summary,
      });

      stack.push({
        id: `res-${itemCounter++}`,
        value: res,
        label: formatNumber(res),
        isResult: true,
      });

      steps.push({
        stepIndex: steps.length,
        notation: 'postfix',
        action: 'COMPUTE',
        currentTokenIndex: i,
        currentToken: token,
        stack: [...stack],
        activeCalculation: {
          left: leftItem.value,
          right: rightItem.value,
          operator: token.display,
          result: res,
          summary,
        },
        explanation: `${summary}, then push ${formatNumber(res)}.`,
        logSoFar: [...log],
        finalResult: null,
      });
    }
  }

  const finalResult = stack.length === 1 ? stack[0].value : null;
  steps.push({
    stepIndex: steps.length,
    notation: 'postfix',
    action: 'COMPLETE',
    currentTokenIndex: null,
    currentToken: null,
    stack: [...stack],
    activeCalculation: null,
    explanation:
      finalResult !== null
        ? `Postfix evaluation complete! Final value on stack: ${formatNumber(finalResult)}.`
        : 'Evaluation finished.',
    logSoFar: [...log],
    finalResult,
  });

  return steps;
}

/**
 * Evaluates a Prefix (Polish Notation) expression RIGHT-TO-LEFT
 * using an operand stack, recording every push and binary calculation.
 */
export function buildPrefixEvalSteps(
  prefixTokens: Token[],
  variables: VariableMap
): StackEvalStep[] {
  const steps: StackEvalStep[] = [];
  const stack: StackOperandItem[] = [];
  const log: CalculationLogEntry[] = [];
  let itemCounter = 0;

  steps.push({
    stepIndex: 0,
    notation: 'prefix',
    action: 'INIT',
    currentTokenIndex: null,
    currentToken: null,
    stack: [],
    activeCalculation: null,
    explanation: 'Scan Prefix tokens RIGHT-TO-LEFT with an empty operand stack.',
    logSoFar: [],
    finalResult: null,
  });

  for (let i = prefixTokens.length - 1; i >= 0; i--) {
    const token = prefixTokens[i];

    if (token.type === 'NUMBER' || token.type === 'VARIABLE') {
      const val = resolveOperandValue(token, variables);
      const label =
        token.type === 'VARIABLE' ? `${token.display}=${formatNumber(val)}` : formatNumber(val);

      stack.push({
        id: `pop-${itemCounter++}`,
        value: val,
        label,
      });

      steps.push({
        stepIndex: steps.length,
        notation: 'prefix',
        action: 'PUSH_VALUE',
        currentTokenIndex: i,
        currentToken: token,
        stack: [...stack],
        activeCalculation: null,
        explanation:
          token.type === 'VARIABLE'
            ? `Read variable ${token.display} (= ${formatNumber(val)}) from right → push ${formatNumber(val)} onto stack.`
            : `Read number ${formatNumber(val)} from right → push ${formatNumber(val)} onto stack.`,
        logSoFar: [...log],
        finalResult: null,
      });
    } else if (token.type === 'OPERATOR' && isOperatorSymbol(token.value)) {
      if (stack.length < 2) {
        steps.push({
          stepIndex: steps.length,
          notation: 'prefix',
          action: 'ERROR',
          currentTokenIndex: i,
          currentToken: token,
          stack: [...stack],
          activeCalculation: null,
          explanation: `Stack underflow while applying "${token.display}".`,
          logSoFar: [...log],
          finalResult: null,
          error: 'Insufficient operands on stack.',
        });
        return steps;
      }

      // Because we scan right-to-left, the first popped item is LEFT, second is RIGHT
      const leftItem = stack.pop()!;
      const rightItem = stack.pop()!;
      const outcome = applyOperator(leftItem.value, rightItem.value, token.value);

      if (!outcome.ok) {
        steps.push({
          stepIndex: steps.length,
          notation: 'prefix',
          action: 'ERROR',
          currentTokenIndex: i,
          currentToken: token,
          stack: [...stack],
          activeCalculation: null,
          explanation: outcome.error,
          logSoFar: [...log],
          finalResult: null,
          error: outcome.error,
        });
        return steps;
      }

      const res = outcome.value;
      const calcExpr = `${formatNumber(leftItem.value)} ${token.display} ${formatNumber(rightItem.value)}`;
      const summary = `Pop ${formatNumber(leftItem.value)} and ${formatNumber(rightItem.value)} → ${calcExpr} = ${formatNumber(res)}`;

      log.push({
        stepNumber: log.length + 1,
        notation: 'prefix',
        expression: calcExpr,
        result: res,
        detail: summary,
      });

      stack.push({
        id: `pres-${itemCounter++}`,
        value: res,
        label: formatNumber(res),
        isResult: true,
      });

      steps.push({
        stepIndex: steps.length,
        notation: 'prefix',
        action: 'COMPUTE',
        currentTokenIndex: i,
        currentToken: token,
        stack: [...stack],
        activeCalculation: {
          left: leftItem.value,
          right: rightItem.value,
          operator: token.display,
          result: res,
          summary,
        },
        explanation: `${summary}, then push ${formatNumber(res)}.`,
        logSoFar: [...log],
        finalResult: null,
      });
    }
  }

  const finalResult = stack.length === 1 ? stack[0].value : null;
  steps.push({
    stepIndex: steps.length,
    notation: 'prefix',
    action: 'COMPLETE',
    currentTokenIndex: null,
    currentToken: null,
    stack: [...stack],
    activeCalculation: null,
    explanation:
      finalResult !== null
        ? `Prefix evaluation complete! Final value on stack: ${formatNumber(finalResult)}.`
        : 'Evaluation finished.',
    logSoFar: [...log],
    finalResult,
  });

  return steps;
}

/**
 * Internal mutable AST clone for step-by-step Infix order-of-operations reduction.
 */
interface EvalAstNode {
  id: string;
  kind: 'VALUE' | 'OP';
  value?: number;
  operator?: OperatorSymbol;
  left?: EvalAstNode;
  right?: EvalAstNode;
  /** Whether this node was explicitly grouped with parentheses relative to its parent */
  isGrouped?: boolean;
  orderX: number;
}

function cloneAstForEval(node: ExprNode, variables: VariableMap, parent?: ExprNode, side?: 'left' | 'right'): EvalAstNode {
  if (node.token.type === 'NUMBER' || node.token.type === 'VARIABLE') {
    return {
      id: node.id,
      kind: 'VALUE',
      value: resolveOperandValue(node.token, variables),
      orderX: node.x,
    };
  }

  let isGrouped = false;
  if (parent && parent.token.type === 'OPERATOR') {
    const pPrec = getPrecedence(parent.token.value);
    const cPrec = getPrecedence(node.token.value);
    const pAssoc = getAssociativity(parent.token.value);
    if (
      cPrec < pPrec ||
      (cPrec === pPrec && side === 'right' && pAssoc === 'LEFT' && (parent.token.value === '-' || parent.token.value === '/')) ||
      (cPrec === pPrec && side === 'left' && pAssoc === 'RIGHT')
    ) {
      isGrouped = true;
    }
  }

  return {
    id: node.id,
    kind: 'OP',
    operator: node.token.value as OperatorSymbol,
    left: node.left ? cloneAstForEval(node.left, variables, node, 'left') : undefined,
    right: node.right ? cloneAstForEval(node.right, variables, node, 'right') : undefined,
    isGrouped,
    orderX: node.x,
  };
}

function renderEvalAstSegments(
  node: EvalAstNode,
  highlightId: string | null,
  parent?: EvalAstNode,
  side?: 'left' | 'right'
): Array<{ text: string; isHighlighted: boolean }> {
  if (node.kind === 'VALUE') {
    return [{ text: formatNumber(node.value ?? 0), isHighlighted: node.id === highlightId }];
  }

  const isTarget = node.id === highlightId;
  const leftSegs = node.left ? renderEvalAstSegments(node.left, highlightId, node, 'left') : [];
  const rightSegs = node.right ? renderEvalAstSegments(node.right, highlightId, node, 'right') : [];
  const opDisp = getDisplayOperator(node.operator ?? '+');

  let wrap = false;
  if (parent && parent.kind === 'OP' && parent.operator && node.operator) {
    const pPrec = getPrecedence(parent.operator);
    const cPrec = getPrecedence(node.operator);
    const pAssoc = getAssociativity(parent.operator);
    if (
      cPrec < pPrec ||
      (cPrec === pPrec && side === 'right' && pAssoc === 'LEFT' && (parent.operator === '-' || parent.operator === '/')) ||
      (cPrec === pPrec && side === 'left' && pAssoc === 'RIGHT')
    ) {
      wrap = true;
    }
  }

  const inner: Array<{ text: string; isHighlighted: boolean }> = [
    ...leftSegs,
    { text: ` ${opDisp} `, isHighlighted: isTarget },
    ...rightSegs,
  ].map((seg) => (isTarget ? { ...seg, isHighlighted: true } : seg));

  if (wrap) {
    return [
      { text: '(', isHighlighted: isTarget },
      ...inner,
      { text: ')', isHighlighted: isTarget },
    ];
  }
  return inner;
}

function mergeAdjacentSegments(
  segs: Array<{ text: string; isHighlighted: boolean }>
): Array<{ text: string; isHighlighted: boolean }> {
  const merged: Array<{ text: string; isHighlighted: boolean }> = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.isHighlighted === s.isHighlighted) {
      last.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/**
 * Evaluates an Infix expression step-by-step in standard PEMDAS/BODMAS order,
 * highlighting each sub-expression as it reduces.
 */
export function buildInfixEvalSteps(
  root: ExprNode | null,
  variables: VariableMap
): InfixEvalStep[] {
  if (!root) return [];

  let tree = cloneAstForEval(root, variables);
  const steps: InfixEvalStep[] = [];
  const log: CalculationLogEntry[] = [];

  // Initial substituted state
  steps.push({
    stepIndex: 0,
    segments: mergeAdjacentSegments(renderEvalAstSegments(tree, null)),
    activeCalculation: null,
    explanation: 'Substitute any variables and follow order of operations (Parentheses → ^ → × ÷ → + −).',
    logSoFar: [],
    finalResult: tree.kind === 'VALUE' ? (tree.value ?? null) : null,
  });

  // Iteratively find the next ready operator (both children are VALUEs)
  const findReadyOperators = (node: EvalAstNode, parenDepth: number): Array<{ node: EvalAstNode; parenDepth: number }> => {
    if (node.kind === 'VALUE') return [];
    const nextDepth = parenDepth + (node.isGrouped ? 1 : 0);
    if (node.left?.kind === 'VALUE' && node.right?.kind === 'VALUE') {
      return [{ node, parenDepth: nextDepth }];
    }
    return [
      ...(node.left ? findReadyOperators(node.left, nextDepth) : []),
      ...(node.right ? findReadyOperators(node.right, nextDepth) : []),
    ];
  };

  const replaceNodeWithValue = (curr: EvalAstNode, targetId: string, newValue: number): EvalAstNode => {
    if (curr.id === targetId) {
      return {
        id: targetId,
        kind: 'VALUE',
        value: newValue,
        orderX: curr.orderX,
      };
    }
    if (curr.kind === 'OP') {
      return {
        ...curr,
        left: curr.left ? replaceNodeWithValue(curr.left, targetId, newValue) : undefined,
        right: curr.right ? replaceNodeWithValue(curr.right, targetId, newValue) : undefined,
      };
    }
    return curr;
  };

  while (tree.kind === 'OP') {
    const candidates = findReadyOperators(tree, 0);
    if (candidates.length === 0) break;

    // Choose deepest parenthesized group -> highest precedence -> leftmost
    candidates.sort((a, b) => {
      if (b.parenDepth !== a.parenDepth) return b.parenDepth - a.parenDepth;
      const precA = getPrecedence(a.node.operator ?? '+');
      const precB = getPrecedence(b.node.operator ?? '+');
      if (precB !== precA) return precB - precA;
      return a.node.orderX - b.node.orderX;
    });

    const chosen = candidates[0].node;
    const leftVal = chosen.left!.value!;
    const rightVal = chosen.right!.value!;
    const op = chosen.operator!;
    const opDisplay = getDisplayOperator(op);

    const outcome = applyOperator(leftVal, rightVal, op);
    if (!outcome.ok) {
      steps.push({
        stepIndex: steps.length,
        segments: mergeAdjacentSegments(renderEvalAstSegments(tree, chosen.id)),
        activeCalculation: null,
        explanation: outcome.error,
        logSoFar: [...log],
        finalResult: null,
        error: outcome.error,
      });
      return steps;
    }

    const res = outcome.value;
    const calcExpr = `${formatNumber(leftVal)} ${opDisplay} ${formatNumber(rightVal)}`;
    const summary = `Evaluate ${calcExpr} = ${formatNumber(res)}`;

    log.push({
      stepNumber: log.length + 1,
      notation: 'infix',
      expression: calcExpr,
      result: res,
      detail: summary,
    });

    // Show highlighted sub-expression BEFORE replacing, or show replacement with summary
    steps.push({
      stepIndex: steps.length,
      segments: mergeAdjacentSegments(renderEvalAstSegments(tree, chosen.id)),
      activeCalculation: {
        left: leftVal,
        right: rightVal,
        operator: opDisplay,
        result: res,
        summary,
      },
      explanation: `${summary} (highest priority sub-expression).`,
      logSoFar: [...log],
      finalResult: null,
    });

    tree = replaceNodeWithValue(tree, chosen.id, res);
  }

  const finalVal = tree.kind === 'VALUE' ? (tree.value ?? null) : null;
  steps.push({
    stepIndex: steps.length,
    segments: [{ text: finalVal !== null ? formatNumber(finalVal) : '?', isHighlighted: true }],
    activeCalculation: null,
    explanation:
      finalVal !== null
        ? `Infix evaluation complete! Final value: ${formatNumber(finalVal)}.`
        : 'Evaluation complete.',
    logSoFar: [...log],
    finalResult: finalVal,
  });

  return steps;
}
