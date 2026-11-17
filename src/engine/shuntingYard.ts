import { getAssociativity, getPrecedence } from './precedence';
import { ShuntingYardStep, Token } from './types';

export interface ShuntingYardOptions {
  /**
   * When true, runs the modified precedence pop rule required when scanning
   * a reversed infix expression for Infix -> Prefix conversion:
   * - Left-associative operators pop only when stackTop.prec > incoming.prec
   * - Right-associative operators (^) pop when stackTop.prec >= incoming.prec
   */
  reversedMode?: boolean;
}

/**
 * Edsger Dijkstra's Shunting-Yard Algorithm.
 * Converts an Infix token stream into Postfix (Reverse Polish Notation)
 * while recording an immutable snapshot after every atomic stack/queue action.
 */
export function buildShuntingYardSteps(
  tokens: Token[],
  options: ShuntingYardOptions = {}
): { postfix: Token[]; steps: ShuntingYardStep[] } {
  const reversedMode = options.reversedMode ?? false;
  const stack: Token[] = [];
  const output: Token[] = [];
  const steps: ShuntingYardStep[] = [];

  const pushSnapshot = (
    partial: Omit<ShuntingYardStep, 'stepIndex' | 'stack' | 'output'>
  ) => {
    steps.push({
      stepIndex: steps.length,
      stack: [...stack],
      output: [...output],
      ...partial,
    });
  };

  pushSnapshot({
    action: 'INIT',
    currentTokenIndex: null,
    currentToken: null,
    explanation: reversedMode
      ? 'Start Shunting-Yard on the reversed, paren-swapped tokens.'
      : 'Initialize an empty operator stack and output queue.',
    ruleHighlight: null,
  });

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // 1. Operands (numbers or variables) go straight to the output queue
    if (token.type === 'NUMBER' || token.type === 'VARIABLE') {
      output.push(token);
      pushSnapshot({
        action: 'OUTPUT_OPERAND',
        currentTokenIndex: i,
        currentToken: token,
        explanation: `Read operand "${token.display}" → append directly to output queue.`,
        ruleHighlight: null,
      });
      continue;
    }

    // 2. Left parenthesis is always pushed onto the stack as a barrier
    if (token.type === 'LPAREN') {
      stack.push(token);
      pushSnapshot({
        action: 'PUSH_PAREN',
        currentTokenIndex: i,
        currentToken: token,
        explanation: 'Read "(" → push onto operator stack to open a grouped sub-expression.',
        ruleHighlight: 'PAREN',
      });
      continue;
    }

    // 3. Right parenthesis pops operators until its matching '(' is found
    if (token.type === 'RPAREN') {
      while (stack.length > 0 && stack[stack.length - 1].type !== 'LPAREN') {
        const popped = stack.pop()!;
        output.push(popped);
        pushSnapshot({
          action: 'POP_OPERATOR',
          currentTokenIndex: i,
          currentToken: token,
          explanation: `Read ")" → pop "${popped.display}" from stack to output until "(" is reached.`,
          ruleHighlight: 'PAREN',
        });
      }

      // Discard the matching '('
      if (stack.length > 0 && stack[stack.length - 1].type === 'LPAREN') {
        stack.pop();
        pushSnapshot({
          action: 'POP_PAREN_MATCH',
          currentTokenIndex: i,
          currentToken: token,
          explanation: 'Found matching "(" on stack → discard both parentheses.',
          ruleHighlight: 'PAREN',
        });
      }
      continue;
    }

    // 4. Operator: compare precedence & associativity against stack top
    if (token.type === 'OPERATOR') {
      const incomingPrec = getPrecedence(token.value);
      const incomingAssoc = getAssociativity(token.value);

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type !== 'OPERATOR') break;

        const topPrec = getPrecedence(top.value);

        /**
         * Standard Left-to-Right Shunting-Yard pop condition:
         * Pop `top` if:
         *   topPrec > incomingPrec, OR
         *   (topPrec === incomingPrec && incomingAssoc === 'LEFT')
         *
         * Reversed-scan Prefix conversion flips the equal-precedence tie-breaker:
         *   topPrec > incomingPrec, OR
         *   (topPrec === incomingPrec && incomingAssoc === 'RIGHT')
         */
        const shouldPop = reversedMode
          ? topPrec > incomingPrec || (topPrec === incomingPrec && incomingAssoc === 'RIGHT')
          : topPrec > incomingPrec || (topPrec === incomingPrec && incomingAssoc === 'LEFT');

        if (!shouldPop) break;

        stack.pop();
        output.push(top);

        const reason =
          topPrec > incomingPrec
            ? `"${top.display}" (prec ${topPrec}) has higher precedence than "${token.display}" (prec ${incomingPrec}), so pop "${top.display}" to output.`
            : reversedMode
              ? `"${top.display}" and "${token.display}" share precedence ${topPrec} (right-assoc in reversed scan), so pop "${top.display}" to output.`
              : `"${top.display}" and "${token.display}" share precedence ${topPrec} and are left-associative, so pop "${top.display}" to output.`;

        pushSnapshot({
          action: 'POP_OPERATOR',
          currentTokenIndex: i,
          currentToken: token,
          explanation: reason,
          ruleHighlight: top.value as ShuntingYardStep['ruleHighlight'],
        });
      }

      // Explain why the incoming operator is now pushed
      let pushReason = `Push "${token.display}" (prec ${incomingPrec}) onto empty operator stack.`;
      if (stack.length > 0) {
        const newTop = stack[stack.length - 1];
        if (newTop.type === 'LPAREN') {
          pushReason = `Top of stack is "(", so push "${token.display}" onto the stack.`;
        } else {
          const newTopPrec = getPrecedence(newTop.value);
          if (incomingPrec > newTopPrec) {
            pushReason = `"${token.display}" (prec ${incomingPrec}) has higher precedence than "${newTop.display}" (prec ${newTopPrec}), so push "${token.display}" onto stack.`;
          } else {
            pushReason = `"${token.display}" (${incomingAssoc.toLowerCase()}-associative, prec ${incomingPrec}) stays above "${newTop.display}" on the stack.`;
          }
        }
      }

      stack.push(token);
      pushSnapshot({
        action: 'PUSH_OPERATOR',
        currentTokenIndex: i,
        currentToken: token,
        explanation: pushReason,
        ruleHighlight: token.value as ShuntingYardStep['ruleHighlight'],
      });
    }
  }

  // 5. Flush remaining operators from stack to output
  while (stack.length > 0) {
    const popped = stack.pop()!;
    output.push(popped);
    pushSnapshot({
      action: 'FLUSH_STACK',
      currentTokenIndex: null,
      currentToken: popped,
      explanation: `End of input → flush remaining "${popped.display}" from stack to output.`,
      ruleHighlight: popped.type === 'OPERATOR' ? (popped.value as ShuntingYardStep['ruleHighlight']) : null,
    });
  }

  pushSnapshot({
    action: 'COMPLETE',
    currentTokenIndex: null,
    currentToken: null,
    explanation: `Conversion complete! Output: ${output.map((t) => t.display).join(' ')}`,
    ruleHighlight: null,
  });

  return { postfix: output, steps };
}
