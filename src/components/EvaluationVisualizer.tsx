import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calculator, CheckCircle2, ListChecks } from 'lucide-react';
import {
  CalculationLogEntry,
  ExpressionAnalysis,
  formatNumber,
  InfixEvalStep,
  StackEvalStep,
} from '../engine';
import { PlaybackControls } from './PlaybackControls';
import { SpokenText } from './SpokenText';
import { useVoiceNarrator } from '../context/VoiceNarratorContext';
import { getCombinedEvaluationNarrative } from '../utils/speechText';
import { soundFX } from '../utils/sound';

interface EvaluationVisualizerProps {
  analysis: ExpressionAnalysis;
}

function OperandStackColumn({
  title,
  directionLabel,
  tokens,
  step,
  accent,
}: {
  title: string;
  directionLabel: string;
  tokens: ExpressionAnalysis['postfixTokens'];
  step: StackEvalStep | undefined;
  accent: 'emerald' | 'orange';
}) {
  const isPostfix = accent === 'emerald';
  const borderAccent = isPostfix ? 'border-emerald-500/30' : 'border-orange-500/30';
  const titleColor = isPostfix ? 'text-emerald-300' : 'text-orange-300';
  const activeTokenClass = isPostfix
    ? 'border-emerald-400 bg-emerald-500/25 text-white scale-105'
    : 'border-orange-400 bg-orange-500/25 text-white scale-105';
  const resultBlockClass = isPostfix
    ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100'
    : 'border-orange-400/70 bg-orange-500/20 text-orange-100';

  const currentIdx = step?.currentTokenIndex ?? null;
  const stack = step?.stack ?? [];

  return (
    <div
      className={`rounded-2xl border ${borderAccent} bg-[#0F172A]/90 p-4 flex flex-col justify-between gap-4`}
    >
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className={`text-base font-semibold ${titleColor}`}>{title}</h3>
          <span className="text-xs text-slate-400">{directionLabel}</span>
        </div>

        {/* Token Scan Strip */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 min-h-[52px]">
          {tokens.map((tok, i) => {
            const isCurr = currentIdx === i;
            const isDone =
              currentIdx !== null &&
              (isPostfix ? i < currentIdx : i > currentIdx);
            return (
              <span
                key={`${tok.id}-eval-${i}`}
                className={`inline-flex items-center justify-center min-w-[30px] h-8 px-2 rounded-md font-mono text-xs font-semibold border transition-all ${
                  isCurr
                    ? activeTokenClass
                    : isDone || step?.action === 'COMPLETE'
                      ? 'border-slate-800 bg-slate-900/40 text-slate-500'
                      : 'border-slate-700/80 bg-slate-900 text-slate-200'
                }`}
              >
                {tok.display}
              </span>
            );
          })}
        </div>

        {/* Active Calculation Callout */}
        <div className="min-h-[54px] rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 flex items-center">
          {step?.activeCalculation ? (
            <p className="font-mono text-xs sm:text-sm text-amber-200 font-medium">
              {step.activeCalculation.summary}
            </p>
          ) : step?.error ? (
            <p className="text-xs text-rose-300">{step.error}</p>
          ) : (
            <p className="text-xs text-slate-300 leading-relaxed">
              {step?.explanation ?? 'Ready to evaluate.'}
            </p>
          )}
        </div>
      </div>

      {/* Vertical Operand Stack */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Operand Stack</span>
          <span className="font-mono tabular-nums">{stack.length} items</span>
        </div>
        <div className="flex flex-col-reverse justify-start gap-1.5 border-b-2 border-x-2 border-slate-800 rounded-b-xl p-3 bg-slate-950/60 min-h-[168px]">
          <AnimatePresence initial={false}>
            {stack.length === 0 ? (
              <div className="m-auto text-xs text-slate-500">Empty</div>
            ) : (
              stack.map((item, idx) => {
                const isTop = idx === stack.length - 1;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: -14, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -14, scale: 0.92 }}
                    transition={{ duration: 0.18 }}
                    className={`flex items-center justify-between px-3 h-9 rounded-lg font-mono text-sm font-bold border tabular-nums ${
                      item.isResult
                        ? resultBlockClass
                        : isTop
                          ? 'border-sky-400/50 bg-slate-800 text-white'
                          : 'border-slate-700/80 bg-slate-900 text-slate-200'
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.isResult && (
                      <span className="text-[10px] font-sans font-medium opacity-80">
                        RESULT
                      </span>
                    )}
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export function EvaluationVisualizer({ analysis }: EvaluationVisualizerProps) {
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

  const infixSteps: InfixEvalStep[] = analysis.evaluations.infix;
  const prefixSteps: StackEvalStep[] = analysis.evaluations.prefix;
  const postfixSteps: StackEvalStep[] = analysis.evaluations.postfix;

  const totalSteps = Math.max(
    infixSteps.length,
    prefixSteps.length,
    postfixSteps.length,
    1
  );

  const getStepParts = useCallback(
    (idx: number) => ({
      infix: infixSteps[Math.min(idx, Math.max(0, infixSteps.length - 1))],
      prefix: prefixSteps[Math.min(idx, Math.max(0, prefixSteps.length - 1))],
      postfix: postfixSteps[Math.min(idx, Math.max(0, postfixSteps.length - 1))],
    }),
    [infixSteps, prefixSteps, postfixSteps]
  );

  const getNarrativeAt = useCallback(
    (idx: number) => {
      const parts = getStepParts(idx);
      return getCombinedEvaluationNarrative(
        parts.postfix,
        parts.prefix,
        parts.infix,
        language
      );
    },
    [getStepParts, language]
  );

  const { infix: currInfix, prefix: currPrefix, postfix: currPostfix } = getStepParts(stepIdx);
  const currentNarrative = useMemo(() => getNarrativeAt(stepIdx), [getNarrativeAt, stepIdx]);

  const handleReplayStep = useCallback(() => {
    if (currentNarrative) {
      speak(currentNarrative);
    }
  }, [currentNarrative, speak]);

  useEffect(() => {
    registerReplayHandler(analysis.validation.valid ? handleReplayStep : null);
    return () => registerReplayHandler(null);
  }, [analysis.validation.valid, handleReplayStep, registerReplayHandler]);

  // Reset and stop speech when expression changes
  useEffect(() => {
    stop();
    setStepIdx(0);
    setIsPlaying(false);
  }, [analysis.validation.normalizedExpression, stop]);

  const playAudioCue = useCallback(
    (idx: number) => {
      const pf = postfixSteps[Math.min(idx, postfixSteps.length - 1)];
      if (pf?.action === 'PUSH_VALUE') soundFX.playPush();
      else if (pf?.action === 'COMPUTE') soundFX.playPop();
      else soundFX.playStep();
    },
    [postfixSteps]
  );

  // Sync voice with animation in Play mode
  useEffect(() => {
    if (!isPlaying || totalSteps <= 1) return;
    const isLast = stepIdx >= totalSteps - 1;

    if (!muted && supported && currentNarrative) {
      let advanceTimer: number | null = null;
      speak(currentNarrative, {
        onEnd: () => {
          if (isLast) {
            setIsPlaying(false);
          } else {
            advanceTimer = window.setTimeout(() => {
              const nextIdx = Math.min(stepIdx + 1, totalSteps - 1);
              playAudioCue(nextIdx);
              setStepIdx(nextIdx);
            }, Math.round(240 / speedRef.current));
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
      const nextIdx = Math.min(stepIdx + 1, totalSteps - 1);
      playAudioCue(nextIdx);
      setStepIdx(nextIdx);
    }, Math.round(1050 / speed));
    return () => window.clearTimeout(timer);
  }, [
    isPlaying,
    stepIdx,
    totalSteps,
    speed,
    muted,
    supported,
    currentNarrative,
    speak,
    playAudioCue,
  ]);

  const handleTogglePlay = () => {
    if (totalSteps <= 1) return;
    if (isPlaying) {
      stop();
      setIsPlaying(false);
      return;
    }
    if (stepIdx >= totalSteps - 1) {
      setStepIdx(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(true);
    }
  };

  if (!analysis.validation.valid) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-10 text-center text-sm text-slate-400">
        Enter a valid arithmetic expression above to step through all three evaluations.
      </div>
    );
  }

  const combinedLogs: CalculationLogEntry[] = [
    ...(currPostfix?.logSoFar ?? []),
    ...(currPrefix?.logSoFar ?? []),
    ...(currInfix?.logSoFar ?? []),
  ];

  const infixDone = currInfix?.finalResult !== null && currInfix?.finalResult !== undefined;
  const prefixDone = currPrefix?.finalResult !== null && currPrefix?.finalResult !== undefined;
  const postfixDone = currPostfix?.finalResult !== null && currPostfix?.finalResult !== undefined;
  const allComplete =
    infixDone &&
    prefixDone &&
    postfixDone &&
    Math.abs((currInfix.finalResult ?? 0) - (currPostfix.finalResult ?? 0)) < 1e-9 &&
    Math.abs((currPrefix.finalResult ?? 0) - (currPostfix.finalResult ?? 0)) < 1e-9;

  return (
    <div className="space-y-6">
      {/* Header + Narration Box + Playback */}
      <div className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-sky-400" />
              <h2 className="text-xl font-semibold text-white">
                Step-by-Step Evaluation Across All Three Notations
              </h2>
            </div>
            <p className="text-sm text-slate-400">
              Compare how Infix obeys precedence rules while Postfix (left-to-right) and Prefix
              (right-to-left) use pure operand stacks.
            </p>
          </div>
        </div>

        {/* Synchronized Spoken Explanation Box */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 space-y-1.5">
          <span className="text-xs font-medium text-slate-400">
            Step Narration
          </span>
          <SpokenText text={currentNarrative} />
        </div>

        <PlaybackControls
          currentStep={stepIdx}
          totalSteps={totalSteps}
          isPlaying={isPlaying}
          speed={speed}
          onTogglePlay={handleTogglePlay}
          onPrev={() => {
            setIsPlaying(false);
            const prevIdx = Math.max(0, stepIdx - 1);
            setStepIdx(prevIdx);
            speak(getNarrativeAt(prevIdx));
          }}
          onNext={() => {
            setIsPlaying(false);
            const nextIdx = Math.min(totalSteps - 1, stepIdx + 1);
            setStepIdx(nextIdx);
            playAudioCue(nextIdx);
            speak(getNarrativeAt(nextIdx));
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
            speak(getNarrativeAt(idx));
          }}
          accentColor="sky"
        />
      </div>

      {/* Equivalence Banner when all three finish */}
      {allComplete && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/25 px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-100">
                All Three Notations Produce the Exact Same Result!
              </p>
              <p className="text-xs text-emerald-200/80 mt-0.5 font-mono tabular-nums">
                Infix ({formatNumber(currInfix!.finalResult!)}) = Prefix (
                {formatNumber(currPrefix!.finalResult!)}) = Postfix (
                {formatNumber(currPostfix!.finalResult!)})
              </p>
            </div>
          </div>
          <span className="font-mono text-2xl font-bold text-emerald-300 tabular-nums">
            = {formatNumber(currPostfix!.finalResult!)}
          </span>
        </motion.div>
      )}

      {/* Three Evaluation Columns: Postfix, Prefix, Infix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <OperandStackColumn
          title="Postfix Evaluation"
          directionLabel="Scan Left → Right"
          tokens={analysis.postfixTokens}
          step={currPostfix}
          accent="emerald"
        />

        <OperandStackColumn
          title="Prefix Evaluation"
          directionLabel="Scan Right → Left"
          tokens={analysis.prefixTokens}
          step={currPrefix}
          accent="orange"
        />

        {/* Infix Order-of-Operations Reduction */}
        <div className="rounded-2xl border border-sky-500/30 bg-[#0F172A]/90 p-4 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-sky-300">
                Infix Evaluation
              </h3>
              <span className="text-xs text-slate-400">Order of Operations</span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 min-h-[96px] flex items-center justify-center text-center">
              <div className="font-mono text-base sm:text-lg leading-relaxed flex flex-wrap items-center justify-center gap-0.5">
                {(currInfix?.segments ?? []).map((seg, i) => (
                  <span
                    key={i}
                    className={
                      seg.isHighlighted
                        ? 'px-1.5 py-0.5 rounded-md bg-sky-500/25 border border-sky-400/60 text-white font-bold'
                        : 'text-slate-300'
                    }
                  >
                    {seg.text}
                  </span>
                ))}
              </div>
            </div>

            <div className="min-h-[54px] rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 flex items-center">
              {currInfix?.activeCalculation ? (
                <p className="font-mono text-xs sm:text-sm text-sky-200 font-medium">
                  {currInfix.activeCalculation.summary}
                </p>
              ) : currInfix?.error ? (
                <p className="text-xs text-rose-300">{currInfix.error}</p>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currInfix?.explanation ?? 'Ready to evaluate.'}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Reduction Steps</span>
              <span className="font-mono tabular-nums">
                {currInfix?.logSoFar.length ?? 0} solved
              </span>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 min-h-[168px] space-y-2 overflow-y-auto max-h-[210px]">
              {(currInfix?.logSoFar ?? []).length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">
                  Sub-expressions will appear here as they reduce...
                </p>
              ) : (
                currInfix!.logSoFar.map((entry) => (
                  <div
                    key={`infix-log-${entry.stepNumber}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/70 px-3 py-2 text-xs font-mono"
                  >
                    <span className="text-slate-300">
                      {entry.stepNumber}. {entry.expression}
                    </span>
                    <span className="font-bold text-sky-300 tabular-nums">
                      = {formatNumber(entry.result)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full Calculation Log Panel */}
      <section className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-semibold text-white">Full Calculation Log</h3>
          </div>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {combinedLogs.length} operations recorded
          </span>
        </div>

        {combinedLogs.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">
            Step forward or press Play to record every arithmetic calculation across Postfix,
            Prefix, and Infix.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-emerald-300">Postfix Log</p>
              {(currPostfix?.logSoFar ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No operations yet.</p>
              ) : (
                currPostfix!.logSoFar.map((entry) => (
                  <p key={`pf-${entry.stepNumber}`} className="font-mono text-xs text-slate-200 tabular-nums">
                    {entry.stepNumber}. {entry.detail}
                  </p>
                ))
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-orange-300">Prefix Log</p>
              {(currPrefix?.logSoFar ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No operations yet.</p>
              ) : (
                currPrefix!.logSoFar.map((entry) => (
                  <p key={`pr-${entry.stepNumber}`} className="font-mono text-xs text-slate-200 tabular-nums">
                    {entry.stepNumber}. {entry.detail}
                  </p>
                ))
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-sky-300">Infix Log</p>
              {(currInfix?.logSoFar ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">No operations yet.</p>
              ) : (
                currInfix!.logSoFar.map((entry) => (
                  <p key={`in-${entry.stepNumber}`} className="font-mono text-xs text-slate-200 tabular-nums">
                    {entry.stepNumber}. {entry.detail}
                  </p>
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
