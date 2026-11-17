import {
  formatNumber,
  InfixEvalStep,
  PrefixConversionStep,
  ShuntingYardStep,
  StackEvalStep,
  TreeTraversalStep,
} from '../engine';

export type NarratorLanguage = 'en' | 'ar';

export interface OffsetMapping {
  spokenStart: number;
  spokenEnd: number;
  displayStart: number;
  displayEnd: number;
}

export interface PreparedSpeech {
  displayText: string;
  spokenText: string;
  mappings: OffsetMapping[];
}

const EN_SYMBOLS: Record<string, string> = {
  '×': 'times',
  '*': 'times',
  '÷': 'divided by',
  '/': 'divided by',
  '^': 'to the power of',
  '−': 'minus',
  '-': 'minus',
  '+': 'plus',
  '=': 'equals',
  '(': 'open bracket',
  ')': 'close bracket',
};

const AR_SYMBOLS: Record<string, string> = {
  '×': 'ضرب',
  '*': 'ضرب',
  '÷': 'قسمة',
  '/': 'قسمة',
  '^': 'أس',
  '−': 'ناقص',
  '-': 'ناقص',
  '+': 'زائد',
  '=': 'يساوي',
  '(': 'قوس مفتوح',
  ')': 'قوس مغلق',
};

/**
 * Converts a display explanation string into clean spoken text by replacing
 * arithmetic symbols (+ − × ÷ ^ ( ) =) with spoken words, while recording
 * exact character index mappings back to the original display text so
 * SpeechSynthesis `onboundary` events can highlight the matching words/symbols.
 */
export function prepareSpeechFromDisplay(
  displayText: string,
  lang: NarratorLanguage
): PreparedSpeech {
  const symMap = lang === 'ar' ? AR_SYMBOLS : EN_SYMBOLS;
  const mappings: OffsetMapping[] = [];
  let spoken = '';

  let i = 0;
  while (i < displayText.length) {
    const ch = displayText[i];

    // Skip decorative arrow/bullet punctuation from being spoken awkwardly
    if (ch === '→' || ch === '·') {
      const spokenStart = spoken.length;
      spoken += ', ';
      mappings.push({
        spokenStart,
        spokenEnd: spoken.length,
        displayStart: i,
        displayEnd: i + 1,
      });
      i++;
      continue;
    }

    // Ignore surrounding quotes around single tokens like "+" or "("
    if (
      ch === '"' &&
      i + 2 < displayText.length &&
      displayText[i + 2] === '"' &&
      symMap[displayText[i + 1]]
    ) {
      const symWord = symMap[displayText[i + 1]];
      const needLeadingSpace = spoken.length > 0 && !/\s$/.test(spoken);
      if (needLeadingSpace) spoken += ' ';
      const spokenStart = spoken.length;
      spoken += symWord;
      const nextChar = displayText[i + 3];
      const needTrailingSpace = nextChar !== undefined && !/[\s.,;:!?]/.test(nextChar);
      mappings.push({
        spokenStart,
        spokenEnd: spoken.length,
        displayStart: i,
        displayEnd: i + 3,
      });
      if (needTrailingSpace) spoken += ' ';
      i += 3;
      continue;
    }

    // Handle standalone '-' carefully (only treat as "minus" if not part of hyphenated word like "left-to-right")
    const isHyphenInsideWord =
      ch === '-' &&
      i > 0 &&
      i + 1 < displayText.length &&
      /[a-zA-Z]/.test(displayText[i - 1]) &&
      /[a-zA-Z]/.test(displayText[i + 1]);

    if (!isHyphenInsideWord && symMap[ch]) {
      const symWord = symMap[ch];
      const needLeadingSpace = spoken.length > 0 && !/\s$/.test(spoken);
      if (needLeadingSpace) spoken += ' ';
      const spokenStart = spoken.length;
      spoken += symWord;
      const nextChar = displayText[i + 1];
      const needTrailingSpace = nextChar !== undefined && !/[\s.,;:!?]/.test(nextChar);
      mappings.push({
        spokenStart,
        spokenEnd: spoken.length,
        displayStart: i,
        displayEnd: i + 1,
      });
      if (needTrailingSpace) spoken += ' ';
      i++;
      continue;
    }

    // Regular word or number chunk
    if (/\s/.test(ch)) {
      if (spoken.length > 0 && !/\s$/.test(spoken)) {
        spoken += ' ';
      }
      i++;
      continue;
    }

    const start = i;
    while (
      i < displayText.length &&
      !/\s/.test(displayText[i]) &&
      displayText[i] !== '→' &&
      displayText[i] !== '·' &&
      !(
        symMap[displayText[i]] &&
        !(
          displayText[i] === '-' &&
          i > 0 &&
          i + 1 < displayText.length &&
          /[a-zA-Z]/.test(displayText[i - 1]) &&
          /[a-zA-Z]/.test(displayText[i + 1])
        )
      )
    ) {
      i++;
    }

    const chunk = displayText.slice(start, i);
    const spokenChunk =
      lang === 'en'
        ? chunk
            .replace(/\bprec\b/gi, 'precedence')
            .replace(/left-assoc/gi, 'left associative')
            .replace(/right-assoc/gi, 'right associative')
        : chunk;

    const spokenStart = spoken.length;
    spoken += spokenChunk;
    mappings.push({
      spokenStart,
      spokenEnd: spoken.length,
      displayStart: start,
      displayEnd: i,
    });
  }

  return {
    displayText,
    spokenText: spoken.trim(),
    mappings,
  };
}

/**
 * Given a character index inside `spokenText` from `utterance.onboundary`,
 * returns the `[displayStart, displayEnd]` range in `displayText` to highlight.
 */
export function mapSpokenIndexToDisplayRange(
  prepared: PreparedSpeech,
  spokenCharIndex: number
): [number, number] | null {
  for (const m of prepared.mappings) {
    if (spokenCharIndex >= m.spokenStart && spokenCharIndex < m.spokenEnd) {
      return [m.displayStart, m.displayEnd];
    }
  }
  // Nearest preceding mapping fallback
  for (let i = prepared.mappings.length - 1; i >= 0; i--) {
    const m = prepared.mappings[i];
    if (spokenCharIndex >= m.spokenStart) {
      return [m.displayStart, m.displayEnd];
    }
  }
  return null;
}

/**
 * Converts a token list like ["3", "4", "2", "×", "+"] into clean spaced text.
 */
function joinTokens(tokens: Array<{ display: string }>): string {
  return tokens.map((t) => t.display).join(' ');
}

function translateShuntingExplanationToArabic(explanation: string): string {
  return explanation
    .replace(/Read operand\s+"([^"]+)"\s*→\s*append directly to output queue\./i, 'الرمز التالي هو $1، نرسله مباشرة إلى الإخراج.')
    .replace(/Read "\("\s*→\s*push onto operator stack to open a grouped sub-expression\./i, 'نقرأ "(" ونضعه في المكدس لبدء مجموعة.')
    .replace(/Read "\)"\s*→\s*pop "([^"]+)" from stack to output until "\(" is reached\./i, 'نقرأ ")" فنخرج "$1" من المكدس إلى الإخراج.')
    .replace(/Found matching "\(" on stack\s*→\s*discard both parentheses\./i, 'وجدنا "(" المطابق في المكدس، فنحذف القوسين.')
    .replace(/End of input\s*→\s*flush remaining "([^"]+)" from stack to output\./i, 'انتهى الإدخال، فنفرغ "$1" من المكدس إلى الإخراج.')
    .replace(/Conversion complete! Output:\s*(.+)/i, 'اكتمل التحويل! الناتج هو: $1')
    .replace(/"([^"]+)" \(prec (\d+)\) has higher precedence than "([^"]+)" \(prec (\d+)\), so pop "([^"]+)" to output\./i, '"$1" له أولوية أعلى من "$3"، لذلك نخرج "$5" إلى الإخراج.')
    .replace(/"([^"]+)" \(prec (\d+)\) has higher precedence than "([^"]+)" \(prec (\d+)\), so push "([^"]+)" onto stack\./i, '"$1" له أولوية أعلى من "$3"، لذلك ندفع "$5" إلى المكدس.')
    .replace(/"([^"]+)" and "([^"]+)" share precedence (\d+) and are left-associative, so pop "([^"]+)" to output\./i, '"$1" و "$2" لهما نفس الأولوية، لذلك نخرج "$4" إلى الإخراج.')
    .replace(/"([^"]+)" and "([^"]+)" share precedence (\d+) \(right-assoc in reversed scan\), so pop "([^"]+)" to output\./i, '"$1" و "$2" لهما نفس الأولوية في المسح المعكوس، لذلك نخرج "$4" إلى الإخراج.')
    .replace(/Push "([^"]+)" \(prec (\d+)\) onto empty operator stack\./i, 'ندفع العملية "$1" إلى مكدس العمليات الفارغ.')
    .replace(/Top of stack is "\(", so push "([^"]+)" onto the stack\./i, 'أعلى المكدس هو "("، لذلك ندفع "$1" فوقه.');
}

function translateTreeExplanationToArabic(explanation: string): string {
  return explanation
    .replace(/Pre-order: emit "([^"]+)" first, then visit its children\./i, 'الترتيب القبلي: نخرج "$1" أولاً ثم نزور الأبناء.')
    .replace(/Post-order: at "([^"]+)", explore left and right subtrees before emitting\./i, 'الترتيب البعدي: عند "$1" نستكشف الفرع الأيسر والأيمن أولاً.')
    .replace(/Post-order: leaf operand "([^"]+)"\s*→\s*emit "([^"]+)"\./i, 'الترتيب البعدي: المعامل "$1" ورقة، فنخرجه مباشرة.')
    .replace(/Post-order: both children of "([^"]+)" finished\s*→\s*emit "([^"]+)"\./i, 'الترتيب البعدي: اكتمل فرعا "$1"، فنخرج "$2".')
    .replace(/In-order: leaf operand "([^"]+)"\s*→\s*emit "([^"]+)"\./i, 'الترتيب الوسطي: المعامل "$1" ورقة، فنخرجه مباشرة.')
    .replace(/In-order: at "([^"]+)", descend into left subtree first\./i, 'الترتيب الوسطي: عند "$1" ننتقل إلى الفرع الأيسر أولاً.')
    .replace(/In-order: left subtree done\s*→\s*emit operator "([^"]+)", then visit right subtree\./i, 'الترتيب الوسطي: انتهى الفرع الأيسر، فنخرج "$1" ثم نزور الفرع الأيمن.')
    .replace(/Left child "([^"]+)" has lower precedence than "([^"]+)"\s*→\s*open "\(" to preserve grouping\./i, 'الفرع الأيسر "$1" له أولوية أقل من "$2"، فنفتح قوساً "(".')
    .replace(/Right child "([^"]+)" needs grouping under "([^"]+)"\s*→\s*open "\("\./i, 'الفرع الأيمن "$1" يحتاج إلى قوس "(" مع "$2".')
    .replace(/Close "\)" after finishing (left|right) grouped subtree\./i, 'نغلق القوس ")" بعد انتهاء المجموعة.');
}

/**
 * Builds rich, complete narrative sentences for Shunting-Yard steps in EN or AR.
 */
export function getShuntingYardNarrative(
  step: ShuntingYardStep,
  lang: NarratorLanguage
): string {
  const tok = step.currentToken;
  if (lang === 'ar') {
    switch (step.action) {
      case 'INIT':
        return 'نبدأ بمكدس عمليات فارغ وقائمة إخراج فارغة.';
      case 'OUTPUT_OPERAND':
        return `الرمز التالي هو ${tok?.display ?? ''}. إنه ${tok?.type === 'NUMBER' ? 'رقم' : 'متغير'}، لذلك يذهب مباشرة إلى الإخراج.`;
      case 'PUSH_PAREN':
        return 'نقرأ "(" ونضعه في مكدس العمليات لبدء مجموعة.';
      case 'POP_OPERATOR':
        return translateShuntingExplanationToArabic(step.explanation);
      case 'POP_PAREN_MATCH':
        return 'وجدنا "(" المطابق في المكدس، فنحذف القوسين معاً.';
      case 'PUSH_OPERATOR':
        return translateShuntingExplanationToArabic(step.explanation);
      case 'FLUSH_STACK':
        return `انتهى الإدخال، فنفرغ "${tok?.display ?? ''}" من المكدس إلى الإخراج.`;
      case 'COMPLETE':
        return `اكتمل التحويل! الناتج بصيغة Postfix هو: ${joinTokens(step.output)}.`;
    }
  }

  // English full spoken sentences
  switch (step.action) {
    case 'INIT':
      return 'We start with an empty operator stack and an empty output queue.';
    case 'OUTPUT_OPERAND':
      return `Next token is ${tok?.display ?? ''}. It's ${tok?.type === 'NUMBER' ? 'a number' : 'a variable'}, so it goes straight to the output.`;
    case 'PUSH_PAREN':
      return 'Next token is "(". It opens a grouped sub-expression, so we push it onto the operator stack.';
    case 'POP_PAREN_MATCH':
      return 'We reached the matching "(" on the stack, so we discard both brackets.';
    case 'FLUSH_STACK':
      return `End of input reached. We flush the remaining "${tok?.display ?? ''}" from the stack to the output.`;
    case 'COMPLETE':
      return `Conversion complete! The final Postfix expression is ${joinTokens(step.output)}.`;
    default:
      return step.explanation;
  }
}

/**
 * Builds rich, complete narrative sentences for 4-Stage Infix -> Prefix steps.
 */
export function getPrefixConversionNarrative(
  step: PrefixConversionStep,
  lang: NarratorLanguage
): string {
  if (lang === 'ar') {
    switch (step.stage) {
      case 'ORIGINAL':
        return `نبدأ بالتعبير الأصلي: ${joinTokens(step.tokensView)}.`;
      case 'REVERSED':
        return `المرحلة الأولى: نعكس ترتيب الرموز من اليمين إلى اليسار لتصبح: ${joinTokens(step.tokensView)}.`;
      case 'SWAPPED_PARENS':
        return `المرحلة الثانية: نبدّل كل "(" مع ")" للحفاظ على توازن الأقواس.`;
      case 'POSTFIX_PASS':
        return `المرحلة الثالثة: ${translateShuntingExplanationToArabic(step.explanation)}`;
      case 'FINAL_REVERSED':
        return `المرحلة الرابعة: نعكس الناتج لنحصل على صيغة Prefix النهائية: ${joinTokens(step.output)}.`;
    }
  }

  switch (step.stage) {
    case 'ORIGINAL':
      return `We start with the original Infix expression: ${joinTokens(step.tokensView)}.`;
    case 'REVERSED':
      return `Stage 1: Reverse the order of all tokens to get ${joinTokens(step.tokensView)}.`;
    case 'SWAPPED_PARENS':
      return step.explanation;
    case 'POSTFIX_PASS':
      return step.explanation;
    case 'FINAL_REVERSED':
      return `Stage 4: Reverse the intermediate result to get the final Prefix expression: ${joinTokens(step.output)}.`;
  }
}

/**
 * Builds rich, complete narrative sentences for Expression Tree traversal steps.
 */
export function getTreeTraversalNarrative(
  step: TreeTraversalStep,
  lang: NarratorLanguage
): string {
  if (lang === 'ar') {
    return translateTreeExplanationToArabic(step.explanation);
  }
  return step.explanation;
}

/**
 * Builds rich, complete narrative sentences for Postfix/Prefix stack evaluation steps.
 */
export function getStackEvalNarrative(
  step: StackEvalStep,
  lang: NarratorLanguage
): string {
  if (lang === 'ar') {
    if (step.action === 'INIT') {
      return step.notation === 'postfix'
        ? 'نمسح رموز Postfix من اليسار إلى اليمين باستخدام مكدس للأرقام.'
        : 'نمسح رموز Prefix من اليمين إلى اليسار باستخدام مكدس للأرقام.';
    }
    if (step.action === 'PUSH_VALUE') {
      const tok = step.currentToken;
      return `نقرأ ${tok?.display ?? ''} وندفع قيمته إلى مكدس المعاملات.`;
    }
    if (step.action === 'COMPUTE' && step.activeCalculation) {
      const { left, right, operator, result } = step.activeCalculation;
      return `نسحب ${formatNumber(left)} و ${formatNumber(right)} من المكدس. ${formatNumber(left)} ${operator} ${formatNumber(right)} = ${formatNumber(result)}. ندفع ${formatNumber(result)} إلى المكدس.`;
    }
    if (step.action === 'COMPLETE' && step.finalResult !== null) {
      return `اكتمل التقييم! النتيجة النهائية هي ${formatNumber(step.finalResult)}.`;
    }
    return step.explanation;
  }

  if (step.action === 'COMPUTE' && step.activeCalculation) {
    const { left, right, operator, result } = step.activeCalculation;
    return `Pop ${formatNumber(left)} and ${formatNumber(right)}. ${formatNumber(left)} ${operator} ${formatNumber(right)} = ${formatNumber(result)}. Push ${formatNumber(result)} onto the stack.`;
  }
  return step.explanation;
}

/**
 * Builds a unified narrative for EvaluationVisualizer's synchronized 3-column step.
 */
export function getCombinedEvaluationNarrative(
  postfixStep: StackEvalStep | undefined,
  prefixStep: StackEvalStep | undefined,
  infixStep: InfixEvalStep | undefined,
  lang: NarratorLanguage
): string {
  const parts: string[] = [];

  if (postfixStep) {
    if (postfixStep.action === 'INIT') {
      return lang === 'ar'
        ? 'نبدأ تقييم التعبيرات الثلاثة: Postfix من اليسار لليمين، Prefix من اليمين لليسار، و Infix حسب أولوية العمليات.'
        : 'Starting evaluation across all three notations: Postfix scans left-to-right, Prefix scans right-to-left, and Infix follows order of operations.';
    }
    if (postfixStep.action === 'COMPLETE' && infixStep?.finalResult !== null && prefixStep?.finalResult !== null) {
      return lang === 'ar'
        ? `اكتملت جميع الحسابات! التعبيرات الثلاثة متساوية والنتيجة النهائية هي ${formatNumber(postfixStep.finalResult ?? 0)}.`
        : `All three evaluations are complete and equal ${formatNumber(postfixStep.finalResult ?? 0)}.`;
    }
    parts.push(
      lang === 'ar'
        ? `في Postfix: ${getStackEvalNarrative(postfixStep, 'ar')}`
        : `Postfix: ${getStackEvalNarrative(postfixStep, 'en')}`
    );
  }

  if (prefixStep && prefixStep.activeCalculation) {
    parts.push(
      lang === 'ar'
        ? `وفي Prefix: ${getStackEvalNarrative(prefixStep, 'ar')}`
        : `Prefix: ${getStackEvalNarrative(prefixStep, 'en')}`
    );
  }

  if (infixStep && infixStep.activeCalculation) {
    const { left, right, operator, result } = infixStep.activeCalculation;
    parts.push(
      lang === 'ar'
        ? `وفي Infix: نحسب ${formatNumber(left)} ${operator} ${formatNumber(right)} = ${formatNumber(result)}.`
        : `Infix evaluates ${formatNumber(left)} ${operator} ${formatNumber(right)} = ${formatNumber(result)}.`
    );
  }

  return parts.join(' ');
}
