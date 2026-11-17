import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Layers } from 'lucide-react';
import {
  ExpressionAnalysis,
  PRECEDENCE_ROWS,
  PrefixStage,
  Token,
} from '../engine';
import { PlaybackControls } from './PlaybackControls';
import { SpokenText } from './SpokenText';
import { useVoiceNarrator } from '../context/VoiceNarratorContext';
import {
  getPrefixConversionNarrative,
  getShuntingYardNarrative,
} from '../utils/speechText';
import { soundFX } from '../utils/sound';

interface ConversionVisualizerProps {
  analysis: ExpressionAnalysis;
}

type ConversionTarget = 'postfix' | 'prefix';

const PREFIX_STAGES: Array<{ id: PrefixStage; label: string }> = [
  { id: 'ORIGINAL', label: '0. Original' },
  { id: 'REVERSED', label: '1. Reverse' },
  { id: 'SWAPPED_PARENS', label: '2. Swap ( )' },
  { id: 'POSTFIX_PASS', label: '3. Postfix Pass' },
  { id: 'FINAL_REVERSED', label: '4. Reverse Result' },
];

export function ConversionVisualizer({ analysis }: ConversionVisualizerProps) {
  const [target, setTarget] = useState<ConversionTarget>('postfix');
  const [stepIdx, setStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const {
    speak,
    stop,
    muted,
    supported,
    language,
    registerReplayHandler,
  } = useVoiceNarrator();
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const steps =
    target === 'postfix'
      ? analysis.shuntingYardSteps
      : analysis.prefixConversionSteps;

  const currentStep = steps[Math.min(stepIdx, Math.max(0, steps.length - 1))];

  const getStepNarrative = useCallback(
    (idx: number) => {
      const s = steps[idx];
      if (!s) return '';
      if (target === 'postfix' && 'action' in s) {
        return getShuntingYardNarrative(s, language);
      }
      if (target === 'prefix' && 'stage' in s) {
        return getPrefixConversionNarrative(s, language);
      }
      return s.explanation;
    },
    [steps, target, language]
  );

  const currentNarrative = useMemo(
    () => getStepNarrative(Math.min(stepIdx, Math.max(0, steps.length - 1))),
    [getStepNarrative, stepIdx, steps.length]
  );

  const handleReplayStep = useCallback(() => {
    if (currentNarrative) {
      speak(currentNarrative);
    }
  }, [currentNarrative, speak]);

  useEffect(() => {
    registerReplayHandler(currentStep ? handleReplayStep : null);
    return () => registerReplayHandler(null);
  }, [currentStep, handleReplayStep, registerReplayHandler]);

  // Stop speech and reset when expression or conversion target changes
  useEffect(() => {
    stop();
    setStepIdx(0);
    setIsPlaying(false);
  }, [analysis.validation.normalizedExpression, target, stop]);

  const playStepAudioCue = useCallback(
    (idx: number) => {
      const s = steps[idx];
      if (s && 'action' in s) {
        if (s.action === 'PUSH_OPERATOR' || s.action === 'PUSH_PAREN') soundFX.playPush();
        else if (s.action === 'POP_OPERATOR' || s.action === 'FLUSH_STACK') soundFX.playPop();
        else soundFX.playStep();
      } else {
        soundFX.playStep();
      }
    },
    [steps]
  );

  // Sync voice with animation in Play mode
  useEffect(() => {
    if (!isPlaying || steps.length === 0) return;
    const isLast = stepIdx >= steps.length - 1;

    if (!muted && supported && currentNarrative) {
      let advanceTimer: number | null = null;
      speak(currentNarrative, {
        onEnd: () => {
          if (isLast) {
            setIsPlaying(false);
          } else {
            advanceTimer = window.setTimeout(() => {
              const nextIdx = Math.min(stepIdx + 1, steps.length - 1);
              playStepAudioCue(nextIdx);
              setStepIdx(nextIdx);
            }, Math.round(220 / speedRef.current));
          }
        },
      });
      return () => {
        if (advanceTimer !== null) window.clearTimeout(advanceTimer);
      };
    }

    if (isLast) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      const nextIdx = Math.min(stepIdx + 1, steps.length - 1);
      playStepAudioCue(nextIdx);
      setStepIdx(nextIdx);
    }, Math.round(950 / speed));
    return () => window.clearTimeout(timer);
  }, [
    isPlaying,
    stepIdx,
    steps.length,
    speed,
    muted,
    supported,
    currentNarrative,
    speak,
    playStepAudioCue,
  ]);

  const handleTogglePlay = () => {
    if (steps.length <= 1) return;
    if (isPlaying) {
      stop();
      setIsPlaying(false);
      return;
    }
    if (stepIdx >= steps.length - 1) {
      setStepIdx(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
    }
  };

  if (!analysis.validation.valid) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-10 text-center text-sm text-slate-400">
        Enter a valid arithmetic expression above to animate the conversion algorithm.
      </div>
    );
  }

  const inputStream: Token[] =
    target === 'postfix'
      ? analysis.infixTokens
      : (analysis.prefixConversionSteps[Math.min(stepIdx, Math.max(0, steps.length - 1))]?.tokensView ??
        analysis.infixTokens);

  const stackTokens = currentStep?.stack ?? [];
  const outputTokens = currentStep?.output ?? [];
  const activeTokenIdx = currentStep?.currentTokenIndex ?? null;
  const activeRuleOp =
    target === 'postfix' && currentStep && 'ruleHighlight' in currentStep
      ? currentStep.ruleHighlight
      : null;

  const currentPrefixStage =
    target === 'prefix' && currentStep && 'stage' in currentStep ? currentStep.stage : null;

  return (
    <div className="space-y-6">
      {/* Header & Conversion Target Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-semibold text-white">
              {target === 'postfix'
                ? 'Shunting-Yard Algorithm (Infix → Postfix)'
                : 'Four-Stage Conversion (Infix → Prefix)'}
            </h2>
          </div>
          <p className="text-sm text-slate-400">
            {target === 'postfix'
              ? 'Watch tokens flow through the vertical Operator Stack into the Postfix Output Queue.'
              : 'Reverse expression, swap parentheses, run modified Shunting-Yard, then reverse the output.'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/90 border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              stop();
              setTarget('postfix');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
              target === 'postfix'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Infix → Postfix
          </button>
          <button
            type="button"
            onClick={() => {
              stop();
              setTarget('prefix');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
              target === 'prefix'
                ? 'bg-orange-500/20 text-orange-200 border border-orange-400/50'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Infix → Prefix
          </button>
        </div>
      </div>

      {/* Prefix 4-Stage Pipeline Bar */}
      {target === 'prefix' && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {PREFIX_STAGES.map((st) => {
            const isCurrent = currentPrefixStage === st.id;
            return (
              <div
                key={st.id}
                className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                  isCurrent
                    ? 'border-orange-400/60 bg-orange-500/15 text-orange-200'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400'
                }`}
              >
                {st.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Main Grid: Visualizer Stage (8 cols) + Precedence Table (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Stage */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-5 space-y-5">
          {/* Input Token Queue */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-300">
                {target === 'postfix'
                  ? 'Input Tokens (Infix)'
                  : currentPrefixStage === 'ORIGINAL'
                    ? 'Original Infix Tokens'
                    : currentPrefixStage === 'REVERSED'
                      ? 'Reversed Tokens'
                      : 'Reversed & Paren-Swapped Input'}
              </span>
              <span className="font-mono tabular-nums">{inputStream.length} tokens</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/75 p-3.5 min-h-[60px]">
              {inputStream.map((tok, i) => {
                const isCurr = activeTokenIdx === i;
                const isDone = activeTokenIdx !== null && i < activeTokenIdx;
                return (
                  <motion.span
                    key={`${tok.id}-${i}-${tok.display}`}
                    layout
                    className={`inline-flex items-center justify-center min-w-[38px] h-10 px-2.5 rounded-lg font-mono text-sm font-semibold border transition-all ${
                      isCurr
                        ? target === 'postfix'
                          ? 'border-emerald-400 bg-emerald-500/25 text-white scale-105 shadow-sm'
                          : 'border-orange-400 bg-orange-500/25 text-white scale-105 shadow-sm'
                        : isDone
                          ? 'border-slate-800 bg-slate-900/40 text-slate-500'
                          : 'border-slate-700/80 bg-slate-900 text-slate-200'
                    }`}
                  >
                    {tok.display}
                  </motion.span>
                );
              })}
            </div>
          </div>

          {/* Middle Split: Vertical Operator Stack + Output Queue */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
            {/* Vertical Operator Stack */}
            <div className="sm:col-span-4 rounded-xl border border-slate-800 bg-slate-950/75 p-4 flex flex-col justify-between min-h-[250px]">
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="font-semibold text-slate-200">Operator Stack</span>
                <span className="font-mono text-slate-400">LIFO</span>
              </div>

              <div className="flex-1 flex flex-col-reverse justify-start gap-2 border-b-2 border-x-2 border-slate-800 rounded-b-xl p-3 bg-slate-900/40 min-h-[180px]">
                <AnimatePresence initial={false}>
                  {stackTokens.length === 0 ? (
                    <div className="m-auto text-xs text-slate-500 text-center">
                      Stack Empty
                    </div>
                  ) : (
                    stackTokens.map((tok, idx) => {
                      const isTop = idx === stackTokens.length - 1;
                      return (
                        <motion.div
                          key={tok.id}
                          layout
                          initial={{ opacity: 0, y: -18, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -18, scale: 0.9 }}
                          transition={{ duration: 0.18 }}
                          className={`flex items-center justify-between px-3 h-10 rounded-lg font-mono text-sm font-bold border ${
                            isTop
                              ? 'border-sky-400/70 bg-sky-500/20 text-sky-100'
                              : 'border-slate-700 bg-slate-800/80 text-slate-200'
                          }`}
                        >
                          <span>{tok.display}</span>
                          {isTop && (
                            <span className="text-[10px] font-sans font-medium text-sky-300">
                              TOP
                            </span>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Output Queue */}
            <div className="sm:col-span-8 rounded-xl border border-slate-800 bg-slate-950/75 p-4 flex flex-col justify-between min-h-[250px]">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-semibold ${
                      target === 'postfix' ? 'text-emerald-300' : 'text-orange-300'
                    }`}
                  >
                    {target === 'postfix'
                      ? 'Output Queue (Postfix)'
                      : currentPrefixStage === 'FINAL_REVERSED'
                        ? 'Final Prefix Result'
                        : 'Intermediate Output Queue'}
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {outputTokens.length} tokens
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 min-h-[96px]">
                  <AnimatePresence initial={false}>
                    {outputTokens.length === 0 ? (
                      <span className="text-xs text-slate-500">
                        Operands and popped operators arrive here in order...
                      </span>
                    ) : (
                      outputTokens.map((tok, idx) => (
                        <motion.span
                          key={`${tok.id}-out-${idx}`}
                          layout
                          initial={{ opacity: 0, scale: 0.8, x: -8 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          transition={{ duration: 0.18 }}
                          className={`inline-flex items-center justify-center min-w-[38px] h-10 px-2.5 rounded-lg font-mono text-sm font-semibold border ${
                            target === 'postfix'
                              ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-100'
                              : 'border-orange-500/45 bg-orange-500/15 text-orange-100'
                          }`}
                        >
                          {tok.display}
                        </motion.span>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Step Explanation with Spoken Highlight */}
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
                  <span>Step Explanation</span>
                </div>
                <SpokenText text={currentNarrative} />
              </div>
            </div>
          </div>

          {/* Playback Controls */}
          <PlaybackControls
            currentStep={stepIdx}
            totalSteps={steps.length}
            isPlaying={isPlaying}
            speed={speed}
            onTogglePlay={handleTogglePlay}
            onPrev={() => {
              setIsPlaying(false);
              const prevIdx = Math.max(0, stepIdx - 1);
              setStepIdx(prevIdx);
              speak(getStepNarrative(prevIdx));
            }}
            onNext={() => {
              setIsPlaying(false);
              const nextIdx = Math.min(steps.length - 1, stepIdx + 1);
              setStepIdx(nextIdx);
              playStepAudioCue(nextIdx);
              speak(getStepNarrative(nextIdx));
            }}
            onReset={() => {
              stop();
              setIsPlaying(false);
              setStepIdx(0);
            }}
            onSpeedChange={setSpeed}
            onSeek={(idx) => {
              setIsPlaying(false);
              setStepIdx(idx);
              speak(getStepNarrative(idx));
            }}
            accentColor={target === 'postfix' ? 'emerald' : 'orange'}
          />
        </div>

        {/* Right Column: Precedence & Associativity Reference Table */}
        <aside className="lg:col-span-4 rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">
              Precedence &amp; Associativity
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Higher precedence binds tighter. Associativity decides ties between equal-precedence
              operators.
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Op</th>
                  <th className="py-2.5 px-3 font-medium">Prec</th>
                  <th className="py-2.5 px-3 font-medium">Associativity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {PRECEDENCE_ROWS.map((row) => {
                  const isHighlighted = activeRuleOp === row.operator;
                  return (
                    <tr
                      key={row.operator}
                      className={`transition-colors ${
                        isHighlighted ? 'bg-sky-500/15 text-white' : 'bg-slate-900/30 text-slate-300'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-sm font-bold">
                        {row.display}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {row.precedence}
                      </td>
                      <td className="py-2.5 px-3">
                        {row.associativity === 'RIGHT' ? 'Right → Left' : 'Left → Right'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 space-y-2 text-xs text-slate-300 leading-relaxed">
            <p className="font-semibold text-slate-100">Core Shunting-Yard Rule</p>
            <p>
              Pop from the stack to output while the stack top has{' '}
              <strong className="text-slate-100">higher precedence</strong>, or{' '}
              <strong className="text-slate-100">equal precedence</strong> and the incoming operator
              is left-associative.
            </p>
            {target === 'prefix' && (
              <p className="text-orange-200/90">
                Note: In Stage 3 (reversed scan), equal-precedence tie-breaking flips so right-assoc{' '}
                <code className="font-mono">^</code> pops and left-assoc{' '}
                <code className="font-mono">+ − × ÷</code> wait.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
