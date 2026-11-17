import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GitFork } from 'lucide-react';
import {
  ExprNode,
  ExpressionAnalysis,
  TraversalOrder,
  TreeTraversalStep,
} from '../engine';
import { PlaybackControls } from './PlaybackControls';
import { SpokenText } from './SpokenText';
import { useVoiceNarrator } from '../context/VoiceNarratorContext';
import { getTreeTraversalNarrative } from '../utils/speechText';
import { soundFX } from '../utils/sound';

interface LearnModeProps {
  analysis: ExpressionAnalysis;
}

const NOTATION_CARDS = [
  {
    key: 'infix' as const,
    title: 'Infix Notation',
    subtitle: 'Human Standard',
    placement: 'Operator sits BETWEEN its operands',
    example: '3 + 4 × 2',
    parentheses: 'Needed whenever grouping overrides precedence, e.g. (3 + 4) × 2',
    precedence: 'Must follow PEMDAS / BODMAS and left/right associativity rules',
    borderClass: 'border-sky-500/30',
    surfaceClass: 'bg-sky-950/20',
    titleClass: 'text-sky-300',
  },
  {
    key: 'prefix' as const,
    title: 'Prefix (Polish)',
    subtitle: 'Jan Łukasiewicz, 1924',
    placement: 'Operator sits BEFORE its operands',
    example: '+ 3 × 4 2',
    parentheses: 'Never needed — grouping is encoded unambiguously by position',
    precedence: 'No precedence table required; evaluated right-to-left with a stack',
    borderClass: 'border-orange-500/30',
    surfaceClass: 'bg-orange-950/20',
    titleClass: 'text-orange-300',
  },
  {
    key: 'postfix' as const,
    title: 'Postfix (Reverse Polish)',
    subtitle: 'Stack Machine Native',
    placement: 'Operator sits AFTER its operands',
    example: '3 4 2 × +',
    parentheses: 'Never needed — operations execute immediately in arrival order',
    precedence: 'No precedence table required; evaluated left-to-right with a stack',
    borderClass: 'border-emerald-500/30',
    surfaceClass: 'bg-emerald-950/20',
    titleClass: 'text-emerald-300',
  },
];

const TRAVERSAL_META: Record<
  TraversalOrder,
  { label: string; mapsTo: string; rule: string; accent: 'sky' | 'orange' | 'emerald'; colorHex: string }
> = {
  inorder: {
    label: 'In-order Traversal',
    mapsTo: 'Infix',
    rule: 'Left Subtree → Root → Right Subtree',
    accent: 'sky',
    colorHex: '#38BDF8',
  },
  preorder: {
    label: 'Pre-order Traversal',
    mapsTo: 'Prefix',
    rule: 'Root → Left Subtree → Right Subtree',
    accent: 'orange',
    colorHex: '#FB923C',
  },
  postorder: {
    label: 'Post-order Traversal',
    mapsTo: 'Postfix',
    rule: 'Left Subtree → Right Subtree → Root',
    accent: 'emerald',
    colorHex: '#34D399',
  },
};

function collectNodesAndEdges(root: ExprNode | null) {
  const nodes: ExprNode[] = [];
  const edges: Array<{ from: ExprNode; to: ExprNode }> = [];

  const walk = (n: ExprNode | null) => {
    if (!n) return;
    nodes.push(n);
    if (n.left) {
      edges.push({ from: n, to: n.left });
      walk(n.left);
    }
    if (n.right) {
      edges.push({ from: n, to: n.right });
      walk(n.right);
    }
  };
  walk(root);
  return { nodes, edges };
}

export function LearnMode({ analysis }: LearnModeProps) {
  const [order, setOrder] = useState<TraversalOrder>('inorder');
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

  const steps: TreeTraversalStep[] = analysis.traversals[order];
  const currentStep = steps[Math.min(stepIdx, Math.max(0, steps.length - 1))];
  const meta = TRAVERSAL_META[order];

  const currentNarrative = useMemo(
    () => (currentStep ? getTreeTraversalNarrative(currentStep, language) : ''),
    [currentStep, language]
  );

  // Register Replay Step handler for Voice Control Panel
  const handleReplayStep = useCallback(() => {
    if (currentNarrative) {
      speak(currentNarrative);
    }
  }, [currentNarrative, speak]);

  useEffect(() => {
    registerReplayHandler(currentStep ? handleReplayStep : null);
    return () => registerReplayHandler(null);
  }, [currentStep, handleReplayStep, registerReplayHandler]);

  // Reset playback and stop voice immediately when expression or traversal order changes
  useEffect(() => {
    stop();
    setStepIdx(0);
    setIsPlaying(false);
  }, [analysis.validation.normalizedExpression, order, stop]);

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
              soundFX.playStep();
              setStepIdx((prev) => Math.min(prev + 1, steps.length - 1));
            }, Math.round(220 / speedRef.current));
          }
        },
      });
      return () => {
        if (advanceTimer !== null) window.clearTimeout(advanceTimer);
      };
    }

    // Muted / no-speech timer fallback
    if (isLast) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      soundFX.playStep();
      setStepIdx((prev) => Math.min(prev + 1, steps.length - 1));
    }, Math.round(900 / speed));
    return () => window.clearTimeout(timer);
  }, [isPlaying, stepIdx, steps.length, speed, muted, supported, currentNarrative, speak]);

  const { nodes, edges } = useMemo(
    () => collectNodesAndEdges(analysis.treeRoot),
    [analysis.treeRoot]
  );

  const speakStepAt = (idx: number) => {
    const target = steps[idx];
    if (target) {
      speak(getTreeTraversalNarrative(target, language));
    }
  };

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

  return (
    <div className="space-y-8">
      {/* Section 1: Three Color-Coded Notation Concept Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {NOTATION_CARDS.map((card) => (
          <article
            key={card.key}
            className={`rounded-2xl border ${card.borderClass} ${card.surfaceClass} p-5 flex flex-col justify-between gap-4`}
          >
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className={`text-lg font-semibold ${card.titleClass}`}>
                  {card.title}
                </h2>
                <span className="text-xs text-slate-400">{card.subtitle}</span>
              </div>

              <dl className="space-y-2.5 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Operator Placement</dt>
                  <dd className="text-slate-100 font-medium mt-0.5">{card.placement}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Example</dt>
                  <dd className="font-mono text-base text-white mt-0.5">{card.example}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Parentheses</dt>
                  <dd className="text-slate-300 text-xs leading-relaxed mt-0.5">
                    {card.parentheses}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Precedence Rules</dt>
                  <dd className="text-slate-300 text-xs leading-relaxed mt-0.5">
                    {card.precedence}
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </div>

      {/* Section 2: Animated Binary Expression Tree & Traversal */}
      <section className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GitFork className="w-5 h-5 text-sky-400" />
              <h2 className="text-xl font-semibold text-white">
                Expression Tree &amp; Traversal Explorer
              </h2>
            </div>
            <p className="text-sm text-slate-400">
              Every valid expression forms a single binary tree. Walking the same tree in three
              orders produces Infix, Prefix, or Postfix.
            </p>
          </div>

          {/* Traversal Order Selector */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800">
            {(['inorder', 'preorder', 'postorder'] as TraversalOrder[]).map((t) => {
              const tMeta = TRAVERSAL_META[t];
              const active = order === t;
              const activeStyles =
                t === 'inorder'
                  ? 'bg-sky-500/20 text-sky-200 border-sky-400/50'
                  : t === 'preorder'
                    ? 'bg-orange-500/20 text-orange-200 border-orange-400/50'
                    : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50';
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    stop();
                    setOrder(t);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    active
                      ? activeStyles
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tMeta.label} → {tMeta.mapsTo}
                </button>
              );
            })}
          </div>
        </div>

        {!analysis.validation.valid || !analysis.treeRoot ? (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-10 text-center text-sm text-slate-400">
            Enter a valid arithmetic expression above to build and traverse its Expression Tree.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: SVG Tree Stage (7 cols) */}
            <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Rule: <strong className="text-slate-200">{meta.rule}</strong>
                </span>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" />
                    Unvisited
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: meta.colorHex }}
                    />
                    Emitted
                  </span>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="xMidYMid meet"
                  className="w-full h-[290px] sm:h-[340px] select-none"
                  role="img"
                  aria-label="Binary expression tree diagram"
                >
                  {/* Tree Edges */}
                  {edges.map(({ from, to }) => {
                    const isVisited =
                      currentStep?.visitedNodeIds.includes(from.id) &&
                      currentStep?.visitedNodeIds.includes(to.id);
                    return (
                      <line
                        key={`${from.id}-${to.id}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke={isVisited ? meta.colorHex : '#334155'}
                        strokeOpacity={isVisited ? 0.65 : 0.7}
                        strokeWidth={isVisited ? 0.85 : 0.55}
                        className="transition-all duration-200"
                      />
                    );
                  })}

                  {/* Tree Nodes */}
                  {nodes.map((node) => {
                    const isActive = currentStep?.activeNodeId === node.id;
                    const isEmitted = currentStep?.emittedNodeIds.includes(node.id);
                    const isVisited = currentStep?.visitedNodeIds.includes(node.id);
                    const isOp = node.token.type === 'OPERATOR';

                    const fill = isActive
                      ? meta.colorHex
                      : isEmitted
                        ? '#0F172A'
                        : isVisited
                          ? '#1E293B'
                          : '#0B1220';

                    const stroke = isActive
                      ? '#FFFFFF'
                      : isEmitted
                        ? meta.colorHex
                        : isVisited
                          ? '#94A3B8'
                          : '#334155';

                    const textFill = isActive
                      ? '#090E1A'
                      : isEmitted
                        ? '#F8FAFC'
                        : '#CBD5E1';

                    const radius = isOp ? 5.8 : 5.3;

                    return (
                      <g key={node.id} className="transition-transform duration-200">
                        {isActive && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={radius + 2.4}
                            fill={meta.colorHex}
                            fillOpacity={0.22}
                          />
                        )}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={isActive ? 0.9 : 0.65}
                        />
                        <text
                          x={node.x}
                          y={node.y}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill={textFill}
                          fontSize={node.token.display.length > 2 ? '3.3' : '4.1'}
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {node.token.display}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Right: Traversal Output & Controls (5 cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Output String Builder */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">
                    {meta.mapsTo} Output Stream
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {currentStep?.outputTokens.length ?? 0} tokens emitted
                  </span>
                </div>

                <div className="min-h-[58px] rounded-lg border border-slate-800/90 bg-slate-900/70 p-3 flex flex-wrap items-center gap-1.5">
                  <AnimatePresence initial={false}>
                    {(currentStep?.outputTokens ?? []).length === 0 ? (
                      <span className="text-xs text-slate-500">
                        Press Play or Next to walk the tree...
                      </span>
                    ) : (
                      currentStep.outputTokens.map((tok, i) => (
                        <motion.span
                          key={`${order}-${i}-${tok}`}
                          initial={{ opacity: 0, scale: 0.85, y: 4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ duration: 0.16 }}
                          className={`inline-flex items-center justify-center min-w-[30px] h-8 px-2 rounded-md font-mono text-sm font-semibold border ${
                            order === 'inorder'
                              ? 'border-sky-500/40 bg-sky-500/15 text-sky-200'
                              : order === 'preorder'
                                ? 'border-orange-500/40 bg-orange-500/15 text-orange-200'
                                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                          }`}
                        >
                          {tok}
                        </motion.span>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Current Step Explanation with Spoken Highlight */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-1.5 min-h-[96px]">
                <span className="text-xs font-medium text-slate-400">
                  Traversal Narration
                </span>
                <SpokenText
                  text={currentNarrative || 'Ready to traverse expression tree.'}
                />
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
                  speakStepAt(prevIdx);
                }}
                onNext={() => {
                  setIsPlaying(false);
                  const nextIdx = Math.min(steps.length - 1, stepIdx + 1);
                  setStepIdx(nextIdx);
                  soundFX.playStep();
                  speakStepAt(nextIdx);
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
                  speakStepAt(idx);
                }}
                accentColor={meta.accent}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
