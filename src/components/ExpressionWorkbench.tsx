import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import {
  ExpressionAnalysis,
  formatNumber,
  PRESET_EXPRESSIONS,
  VariableMap,
} from '../engine';

interface ExpressionWorkbenchProps {
  expression: string;
  onExpressionChange: (next: string) => void;
  variables: VariableMap;
  onVariableChange: (name: string, value: number) => void;
  analysis: ExpressionAnalysis;
}

const QUICK_SYMBOLS = ['+', '−', '×', '÷', '^', '(', ')'];

export function ExpressionWorkbench({
  expression,
  onExpressionChange,
  variables,
  onVariableChange,
  analysis,
}: ExpressionWorkbenchProps) {
  const { validation, infixTokens, prefixTokens, postfixTokens, evaluations } = analysis;

  const finalPostfixStep = evaluations.postfix[evaluations.postfix.length - 1];
  const hasEvalError = Boolean(finalPostfixStep?.error);
  const finalResult = finalPostfixStep?.finalResult;

  const handleInsertSymbol = (sym: string) => {
    const mapped = sym === '×' ? '*' : sym === '÷' ? '/' : sym === '−' ? '-' : sym;
    const needsSpaceBefore =
      expression.length > 0 && !expression.endsWith(' ') && mapped !== ')';
    const next = `${expression}${needsSpaceBefore ? ' ' : ''}${mapped}${mapped !== '(' ? ' ' : ''}`;
    onExpressionChange(next);
  };

  return (
    <section
      aria-label="Expression input and notation summary"
      className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-4 sm:p-6 space-y-5"
    >
      {/* Top Row: Expression Input + Quick Operators */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="expression-input"
              className="text-sm font-medium text-slate-200"
            >
              Infix Arithmetic Expression
            </label>
            <span className="text-xs text-slate-400">
              Supports integers, variables (A–Z), + − × ÷ ^, and ( )
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="expression-input"
              type="text"
              value={expression}
              onChange={(e) => onExpressionChange(e.target.value)}
              placeholder="e.g. (5 + 3) * (2 - 1) ^ 2"
              spellCheck={false}
              autoComplete="off"
              className={`flex-1 h-12 px-4 rounded-xl bg-slate-950/90 border font-mono text-base sm:text-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-colors ${
                validation.valid
                  ? 'border-slate-700 focus:border-sky-400 focus:ring-sky-500/30'
                  : 'border-rose-500/70 focus:border-rose-400 focus:ring-rose-500/30'
              }`}
            />

            {/* Quick symbol insertion pad */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {QUICK_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => handleInsertSymbol(sym)}
                  aria-label={`Insert ${sym}`}
                  className="h-12 min-w-[42px] px-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-200 font-mono text-base hover:bg-slate-800 hover:border-slate-700 hover:text-white transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Presets Row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400 mr-1">Presets:</span>
        {PRESET_EXPRESSIONS.map((preset) => {
          const isActive = expression.trim() === preset.expression;
          return (
            <button
              key={preset.expression}
              type="button"
              onClick={() => onExpressionChange(preset.expression)}
              className={`px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                isActive
                  ? 'border-sky-400/60 bg-sky-500/15 text-sky-200'
                  : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
              title={preset.hint}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Friendly Validation Error */}
      {!validation.valid && validation.error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-200"
        >
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-rose-100">Expression Syntax Check</p>
            <p className="text-rose-200/90 mt-0.5">{validation.error}</p>
          </div>
        </div>
      )}

      {/* Variable Assignments (shown automatically when variables exist) */}
      {validation.valid && validation.variables.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-800/80">
          <span className="text-xs font-medium text-slate-400">
            Variable Values for Evaluation:
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {validation.variables.map((varName) => {
              const val = variables[varName] ?? 1;
              return (
                <label
                  key={varName}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 text-sm"
                >
                  <span className="font-mono font-semibold text-sky-300">{varName} =</span>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => {
                      const parsed = Number(e.target.value);
                      onVariableChange(varName, Number.isFinite(parsed) ? parsed : 0);
                    }}
                    className="w-16 bg-transparent font-mono text-sm text-slate-100 tabular-nums focus:outline-none"
                    aria-label={`Value for variable ${varName}`}
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Side-by-Side Live Notation Output Strip */}
      {validation.valid && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
          {/* Infix (Blue) */}
          <div className="rounded-xl border border-sky-500/25 bg-sky-950/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-300">Infix (Standard)</span>
              <span className="text-slate-400">Operator between</span>
            </div>
            <p className="font-mono text-sm sm:text-base text-slate-100 break-words">
              {infixTokens.map((t) => t.display).join(' ')}
            </p>
          </div>

          {/* Prefix (Orange) */}
          <div className="rounded-xl border border-orange-500/25 bg-orange-950/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-orange-300">Prefix (Polish)</span>
              <span className="text-slate-400">Operator before</span>
            </div>
            <p className="font-mono text-sm sm:text-base text-slate-100 break-words">
              {prefixTokens.map((t) => t.display).join(' ')}
            </p>
          </div>

          {/* Postfix (Green) */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-300">Postfix (Reverse Polish)</span>
              <span className="text-slate-400">Operator after</span>
            </div>
            <p className="font-mono text-sm sm:text-base text-slate-100 break-words">
              {postfixTokens.map((t) => t.display).join(' ')}
            </p>
          </div>
        </div>
      )}

      {/* Live Evaluated Answer Banner */}
      {validation.valid && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm pt-1">
          {hasEvalError ? (
            <div className="flex items-center gap-2 text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{finalPostfixStep?.error}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Evaluated value across all three notations:{' '}
                <strong className="font-mono text-emerald-300 text-base tabular-nums">
                  {finalResult !== null && finalResult !== undefined ? formatNumber(finalResult) : '—'}
                </strong>
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Edit expression or variables above to update all visualizers live</span>
          </div>
        </div>
      )}
    </section>
  );
}
