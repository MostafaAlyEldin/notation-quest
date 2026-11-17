import { getAssociativity, getPrecedence } from './precedence';
import { ExprNode, Token, TraversalOrder, TreeTraversalStep } from './types';

/**
 * Builds a binary Expression Tree (AST) from a valid Postfix token array.
 * Each operand becomes a leaf node; each operator pops two subtrees (right, then left)
 * and becomes their parent node.
 */
export function buildExpressionTree(postfixTokens: Token[]): ExprNode | null {
  if (postfixTokens.length === 0) return null;

  const stack: ExprNode[] = [];

  for (const token of postfixTokens) {
    if (token.type === 'NUMBER' || token.type === 'VARIABLE') {
      stack.push({
        id: `node-${token.id}`,
        token,
        left: null,
        right: null,
        x: 50,
        y: 50,
        depth: 0,
      });
    } else if (token.type === 'OPERATOR') {
      const right = stack.pop() ?? null;
      const left = stack.pop() ?? null;
      stack.push({
        id: `node-${token.id}`,
        token,
        left,
        right,
        x: 50,
        y: 50,
        depth: 0,
      });
    }
  }

  const root = stack[0] ?? null;
  if (!root) return null;

  // Assign in-order horizontal rank and depth so no two nodes ever overlap
  let rank = 0;
  let maxDepth = 0;

  const countNodes = (node: ExprNode | null): number => {
    if (!node) return 0;
    return 1 + countNodes(node.left) + countNodes(node.right);
  };
  const totalNodes = countNodes(root);

  const assignCoordinates = (node: ExprNode | null, depth: number) => {
    if (!node) return;
    if (depth > maxDepth) maxDepth = depth;
    assignCoordinates(node.left, depth + 1);
    node.depth = depth;
    node.x = totalNodes === 1 ? 50 : 8 + (rank / (totalNodes - 1)) * 84;
    rank++;
    assignCoordinates(node.right, depth + 1);
  };

  assignCoordinates(root, 0);

  const assignY = (node: ExprNode | null) => {
    if (!node) return;
    node.y = maxDepth === 0 ? 50 : 14 + (node.depth / maxDepth) * 72;
    assignY(node.left);
    assignY(node.right);
  };

  assignY(root);

  return root;
}

/**
 * Determines whether a child operator subtree requires parentheses around it
 * when reconstructed in Infix notation.
 */
function childNeedsParens(
  parent: ExprNode,
  child: ExprNode | null,
  side: 'left' | 'right'
): boolean {
  if (!child || child.token.type !== 'OPERATOR') return false;
  const pPrec = getPrecedence(parent.token.value);
  const cPrec = getPrecedence(child.token.value);

  if (cPrec < pPrec) return true;
  if (cPrec > pPrec) return false;

  // Equal precedence edge cases
  const pAssoc = getAssociativity(parent.token.value);
  if (side === 'right' && pAssoc === 'LEFT' && (parent.token.value === '-' || parent.token.value === '/')) {
    return true;
  }
  if (side === 'left' && pAssoc === 'RIGHT') {
    return true;
  }
  return false;
}

/**
 * Generates step-by-step snapshots for In-order, Pre-order, or Post-order traversal
 * of the Expression Tree.
 */
export function buildTreeTraversalSteps(
  root: ExprNode | null,
  order: TraversalOrder
): TreeTraversalStep[] {
  if (!root) return [];

  const steps: TreeTraversalStep[] = [];
  const visited = new Set<string>();
  const emitted = new Set<string>();
  const outputTokens: string[] = [];

  const record = (
    activeNodeId: string | null,
    event: TreeTraversalStep['event'],
    explanation: string
  ) => {
    steps.push({
      stepIndex: steps.length,
      order,
      activeNodeId,
      visitedNodeIds: Array.from(visited),
      emittedNodeIds: Array.from(emitted),
      event,
      outputTokens: [...outputTokens],
      explanation,
    });
  };

  const traverse = (node: ExprNode | null) => {
    if (!node) return;
    const isLeaf = !node.left && !node.right;
    visited.add(node.id);

    if (order === 'preorder') {
      // Root -> Left -> Right (Prefix)
      emitted.add(node.id);
      outputTokens.push(node.token.display);
      record(
        node.id,
        'EMIT',
        `Pre-order: emit "${node.token.display}" first, then visit its children.`
      );
      if (node.left) traverse(node.left);
      if (node.right) traverse(node.right);
      return;
    }

    if (order === 'postorder') {
      // Left -> Right -> Root (Postfix)
      if (!isLeaf) {
        record(
          node.id,
          'VISIT_LEFT',
          `Post-order: at "${node.token.display}", explore left and right subtrees before emitting.`
        );
      }
      if (node.left) traverse(node.left);
      if (node.right) traverse(node.right);
      emitted.add(node.id);
      outputTokens.push(node.token.display);
      record(
        node.id,
        'EMIT',
        isLeaf
          ? `Post-order: leaf operand "${node.token.display}" → emit "${node.token.display}".`
          : `Post-order: both children of "${node.token.display}" finished → emit "${node.token.display}".`
      );
      return;
    }

    // In-order: Left -> Root -> Right (Infix, adding grouping parens where needed)
    if (isLeaf) {
      emitted.add(node.id);
      outputTokens.push(node.token.display);
      record(node.id, 'EMIT', `In-order: leaf operand "${node.token.display}" → emit "${node.token.display}".`);
      return;
    }

    const wrapLeft = childNeedsParens(node, node.left, 'left');
    const wrapRight = childNeedsParens(node, node.right, 'right');

    record(
      node.id,
      'VISIT_LEFT',
      `In-order: at "${node.token.display}", descend into left subtree first.`
    );

    if (wrapLeft) {
      outputTokens.push('(');
      record(
        node.id,
        'ENTER',
        `Left child "${node.left!.token.display}" has lower precedence than "${node.token.display}" → open "(" to preserve grouping.`
      );
    }

    traverse(node.left);

    if (wrapLeft) {
      outputTokens.push(')');
      record(node.id, 'EXIT', `Close ")" after finishing left grouped subtree.`);
    }

    emitted.add(node.id);
    outputTokens.push(node.token.display);
    record(
      node.id,
      'EMIT',
      `In-order: left subtree done → emit operator "${node.token.display}", then visit right subtree.`
    );

    if (wrapRight) {
      outputTokens.push('(');
      record(
        node.id,
        'ENTER',
        `Right child "${node.right!.token.display}" needs grouping under "${node.token.display}" → open "(".`
      );
    }

    traverse(node.right);

    if (wrapRight) {
      outputTokens.push(')');
      record(node.id, 'EXIT', `Close ")" after finishing right grouped subtree.`);
    }
  };

  traverse(root);
  return steps;
}
