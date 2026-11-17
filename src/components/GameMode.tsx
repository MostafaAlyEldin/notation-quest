import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Award,
  CheckCircle2,
  Clock,
  Flame,
  Heart,
  HelpCircle,
  Play,
  RotateCcw,
  Star,
  Trophy,
  XCircle,
} from 'lucide-react';
import {
  GAME_CHALLENGES,
  GameChallenge,
  getChallengeSolution,
  normalizeAnswerTokens,
} from '../data/challenges';
import {
  DEFAULT_VARIABLES,
  formatNumber,
  PrefixConversionStep,
  ShuntingYardAction,
  ShuntingYardStep,
  StackEvalStep,
  Token,
} from '../engine';
import { PlaybackControls } from './PlaybackControls';
import { SpokenText } from './SpokenText';
import { useVoiceNarrator } from '../context/VoiceNarratorContext';
import {
  getPrefixConversionNarrative,
  getShuntingYardNarrative,
  getStackEvalNarrative,
} from '../utils/speechText';
import { soundFX } from '../utils/sound';

type GamePhase = 'MENU' | 'PLAYING' | 'WRONG_REPLAY' | 'SUMMARY';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

interface LevelOutcome {
  level: number;
  title: string;
  difficulty: GameChallenge['difficulty'];
  type: GameChallenge['type'];
  passed: boolean;
  stars: number;
  pointsEarned: number;
  infixExpression: string;
}

interface GameModeProps {
  onSendToLab?: (expression: string) => void;
}

function shuffleTokens(tokens: Token[]): Array<{ key: string; token: Token }> {
  const indexed = tokens.map((token, idx) => ({
    key: `${token.id}-pool-${idx}`,
    token,
  }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  const sameOrder = indexed.every((item, idx) => item.token.value === tokens[idx].value);
  if (sameOrder && indexed.length > 1) {
    [indexed[0], indexed[indexed.length - 1]] = [indexed[indexed.length - 1], indexed[0]];
  }
  return indexed;
}

export function GameMode({ onSendToLab }: GameModeProps) {
  const [phase, setPhase] = useState<GamePhase>('MENU');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [activeQueue, setActiveQueue] = useState<GameChallenge[]>(GAME_CHALLENGES);
  const [levelIdx, setLevelIdx] = useState(0);

  // Player stats
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(45);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [outcomes, setOutcomes] = useState<LevelOutcome[]>([]);
  const [bestStarsByLevel, setBestStarsByLevel] = useState<Record<string, number>>({});

  // Per-question interaction state
  const [typedAnswer, setTypedAnswer] = useState('');
  const [showHint, setShowHint] = useState(false);

  // Drag & Drop state
  const [poolItems, setPoolItems] = useState<Array<{ key: string; token: Token }>>([]);
  const [placedItems, setPlacedItems] = useState<Array<{ key: string; token: Token }>>([]);
  const draggedKeyRef = useRef<{ key: string; from: 'pool' | 'placed' } | null>(null);

  // Stack Simulator state
  const [simStepIndex, setSimStepIndex] = useState(1);
  const [simFeedback, setSimFeedback] = useState<string | null>(null);

  // Wrong-answer replay state
  const [wrongInfo, setWrongInfo] = useState<{
    userAnswer: string;
    correctAnswer: string;
    reason: string;
  } | null>(null);
  const [replayStepIdx, setReplayStepIdx] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1.25);

  const {
    speak,
    stop,
    muted,
    supported,
    language,
    registerReplayHandler,
  } = useVoiceNarrator();
  const replaySpeedRef = useRef(replaySpeed);
  replaySpeedRef.current = replaySpeed;

  const currentChallenge = activeQueue[levelIdx] ?? activeQueue[0];
  const currentSolution = useMemo(
    () => getChallengeSolution(currentChallenge),
    [currentChallenge]
  );

  // Initialize question state whenever level changes during PLAYING
  const initLevelState = (challenge: GameChallenge) => {
    const sol = getChallengeSolution(challenge);
    setTypedAnswer('');
    setShowHint(false);
    setTimeLeft(challenge.timeLimitSec);
    setSimStepIndex(1);
    setSimFeedback(null);
    setWrongInfo(null);

    if (challenge.type === 'DRAG_DROP') {
      setPoolItems(shuffleTokens(sol.targetTokens));
      setPlacedItems([]);
    }
  };

  const startQuest = (filter: DifficultyFilter) => {
    stop();
    const filtered =
      filter === 'all'
        ? GAME_CHALLENGES
        : GAME_CHALLENGES.filter((c) => c.difficulty === filter);
    setActiveQueue(filtered);
    setLevelIdx(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setLives(3);
    setCorrectCount(0);
    setAttemptCount(0);
    setOutcomes([]);
    initLevelState(filtered[0]);
    setPhase('PLAYING');
    soundFX.playPush();
  };

  // Countdown timer during PLAYING
  useEffect(() => {
    if (phase !== 'PLAYING') return;
    if (timeLeft <= 0) {
      handleWrongSubmission('Time expired!', 'The countdown reached 0 seconds.');
      return;
    }
    const timer = window.setTimeout(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const replaySteps = useMemo(() => {
    if (!currentChallenge) return [];
    const { analysis } = currentSolution;
    if (currentChallenge.type === 'EVALUATE') {
      return currentChallenge.targetNotation === 'postfix'
        ? analysis.evaluations.postfix
        : analysis.evaluations.prefix;
    }
    if (currentChallenge.targetNotation === 'prefix') {
      return analysis.prefixConversionSteps;
    }
    return analysis.shuntingYardSteps;
  }, [currentChallenge, currentSolution]);

  const getReplayNarrative = useCallback(
    (idx: number) => {
      const step = replaySteps[idx];
      if (!step) return '';
      if ('notation' in step) {
        return getStackEvalNarrative(step as StackEvalStep, language);
      }
      if ('stage' in step) {
        return getPrefixConversionNarrative(step as PrefixConversionStep, language);
      }
      return getShuntingYardNarrative(step as ShuntingYardStep, language);
    },
    [replaySteps, language]
  );

  const currentReplayNarrative = useMemo(
    () =>
      phase === 'WRONG_REPLAY'
        ? getReplayNarrative(Math.min(replayStepIdx, Math.max(0, replaySteps.length - 1)))
        : '',
    [phase, getReplayNarrative, replayStepIdx, replaySteps.length]
  );

  // Register Replay Step handler for VoiceControlPanel
  const handlePanelReplay = useCallback(() => {
    if (phase === 'WRONG_REPLAY' && currentReplayNarrative) {
      speak(currentReplayNarrative);
    } else if (phase === 'PLAYING' && currentChallenge) {
      speak(currentChallenge.prompt);
    }
  }, [phase, currentReplayNarrative, currentChallenge, speak]);

  useEffect(() => {
    if (phase === 'WRONG_REPLAY' || phase === 'PLAYING') {
      registerReplayHandler(handlePanelReplay);
    } else {
      registerReplayHandler(null);
    }
    return () => registerReplayHandler(null);
  }, [phase, handlePanelReplay, registerReplayHandler]);

  // Sync voice with embedded Wrong-Answer Replay when replayPlaying is true
  useEffect(() => {
    if (phase !== 'WRONG_REPLAY' || !replayPlaying || replaySteps.length === 0) return;
    const isLast = replayStepIdx >= replaySteps.length - 1;

    if (!muted && supported && currentReplayNarrative) {
      let advanceTimer: number | null = null;
      speak(currentReplayNarrative, {
        onEnd: () => {
          if (isLast) {
            setReplayPlaying(false);
          } else {
            advanceTimer = window.setTimeout(() => {
              setReplayStepIdx((p) => Math.min(p + 1, replaySteps.length - 1));
            }, Math.round(220 / replaySpeedRef.current));
          }
        },
      });
      return () => {
        if (advanceTimer !== null) window.clearTimeout(advanceTimer);
      };
    }

    if (isLast) {
      setReplayPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setReplayStepIdx((p) => Math.min(p + 1, replaySteps.length - 1));
    }, Math.round(850 / replaySpeed));
    return () => window.clearTimeout(timer);
  }, [
    phase,
    replayPlaying,
    replayStepIdx,
    replaySteps.length,
    replaySpeed,
    muted,
    supported,
    currentReplayNarrative,
    speak,
  ]);

  const recordWinAndAdvance = (points: number, stars: number) => {
    soundFX.playCorrect();
    const nextStreak = streak + 1;
    setScore((s) => s + points);
    setStreak(nextStreak);
    setBestStreak((b) => Math.max(b, nextStreak));
    setCorrectCount((c) => c + 1);
    setAttemptCount((a) => a + 1);

    setBestStarsByLevel((prev) => ({
      ...prev,
      [currentChallenge.id]: Math.max(prev[currentChallenge.id] ?? 0, stars),
    }));

    setOutcomes((prev) => [
      ...prev,
      {
        level: currentChallenge.level,
        title: currentChallenge.title,
        difficulty: currentChallenge.difficulty,
        type: currentChallenge.type,
        passed: true,
        stars,
        pointsEarned: points,
        infixExpression: currentChallenge.infixExpression,
      },
    ]);

    const winMessage =
      language === 'ar'
        ? nextStreak > 1
          ? `صحيح! ${nextStreak} إجابات متتالية!`
          : 'صحيح! أحسنت.'
        : nextStreak > 1
          ? `Correct! ${nextStreak} in a row!`
          : 'Correct!';

    if (levelIdx + 1 >= activeQueue.length) {
      soundFX.playVictory();
      speak(
        language === 'ar'
          ? `${winMessage} لقد أكملت التحدي!`
          : `${winMessage} Quest complete!`
      );
      setPhase('SUMMARY');
    } else {
      speak(winMessage);
      const nextChallenge = activeQueue[levelIdx + 1];
      setLevelIdx(levelIdx + 1);
      initLevelState(nextChallenge);
    }
  };

  const handleWrongSubmission = (userAnswerText: string, reason: string) => {
    soundFX.playWrong();
    stop();

    const correctDisplay =
      currentChallenge.type === 'EVALUATE'
        ? formatNumber(currentSolution.finalValue)
        : currentSolution.targetString;

    const nextLives = Math.max(0, lives - 1);
    setLives(nextLives);
    setStreak(0);
    setAttemptCount((a) => a + 1);

    setOutcomes((prev) => [
      ...prev,
      {
        level: currentChallenge.level,
        title: currentChallenge.title,
        difficulty: currentChallenge.difficulty,
        type: currentChallenge.type,
        passed: false,
        stars: 0,
        pointsEarned: 0,
        infixExpression: currentChallenge.infixExpression,
      },
    ]);

    setWrongInfo({
      userAnswer: userAnswerText || '(No answer)',
      correctAnswer: correctDisplay,
      reason,
    });
    setReplayStepIdx(0);
    setReplayPlaying(false);
    setPhase('WRONG_REPLAY');

    const mistakeSpeech =
      language === 'ar'
        ? `ليس تماماً. ${reason} الإجابة الصحيحة هي ${correctDisplay}. لنشاهد خطوات الحل.`
        : `Not quite. ${reason} The correct answer is ${correctDisplay}. Let's walk through the solution step by step.`;

    if (!muted && supported) {
      speak(mistakeSpeech, {
        onEnd: () => {
          setReplayPlaying(true);
        },
      });
    } else {
      setReplayPlaying(true);
    }
  };

  const handleContinueAfterReplay = () => {
    stop();
    if (lives <= 0 || levelIdx + 1 >= activeQueue.length) {
      if (lives > 0) soundFX.playVictory();
      setPhase('SUMMARY');
      return;
    }
    const nextChallenge = activeQueue[levelIdx + 1];
    setLevelIdx(levelIdx + 1);
    initLevelState(nextChallenge);
    setPhase('PLAYING');
  };

  const computePointsAndStars = () => {
    const timeBonus = timeLeft * 2;
    const streakBonus = streak * 25;
    const hintPenalty = showHint ? 30 : 0;
    const total = Math.max(50, currentChallenge.basePoints + timeBonus + streakBonus - hintPenalty);
    const timeRatio = timeLeft / currentChallenge.timeLimitSec;
    const stars = !showHint && timeRatio >= 0.4 ? 3 : timeRatio >= 0.15 ? 2 : 1;
    return { total, stars };
  };

  const handleSubmitConvertOrEvaluate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedAnswer.trim()) return;

    if (currentChallenge.type === 'CONVERT') {
      const userToks = normalizeAnswerTokens(typedAnswer);
      const expected = currentSolution.canonicalValues;
      const isMatch =
        userToks.length === expected.length &&
        userToks.every((t, i) => t === expected[i]);

      if (isMatch) {
        const { total, stars } = computePointsAndStars();
        recordWinAndAdvance(total, stars);
      } else {
        handleWrongSubmission(
          typedAnswer.trim(),
          `Your token order did not match the ${currentChallenge.targetNotation.toUpperCase()} conversion.`
        );
      }
      return;
    }

    if (currentChallenge.type === 'EVALUATE') {
      const numeric = Number(typedAnswer.trim());
      if (!Number.isFinite(numeric)) {
        handleWrongSubmission(typedAnswer.trim(), 'Expected a numeric answer.');
        return;
      }
      if (Math.abs(numeric - currentSolution.finalValue) < 1e-6) {
        const { total, stars } = computePointsAndStars();
        recordWinAndAdvance(total, stars);
      } else {
        handleWrongSubmission(
          typedAnswer.trim(),
          `The expression evaluates to ${formatNumber(currentSolution.finalValue)}.`
        );
      }
    }
  };

  const handleSubmitDragDrop = () => {
    if (placedItems.length === 0) return;
    const userToks = placedItems.map((item) => item.token.value.toUpperCase());
    const expected = currentSolution.canonicalValues;
    const isMatch =
      userToks.length === expected.length &&
      userToks.every((t, i) => t === expected[i]);

    if (isMatch) {
      const { total, stars } = computePointsAndStars();
      recordWinAndAdvance(total, stars);
    } else {
      handleWrongSubmission(
        placedItems.map((i) => i.token.display).join(' '),
        `The token order did not match ${currentChallenge.targetNotation.toUpperCase()} notation.`
      );
    }
  };

  const movePoolToPlaced = (key: string) => {
    const found = poolItems.find((p) => p.key === key);
    if (!found) return;
    setPoolItems((prev) => prev.filter((p) => p.key !== key));
    setPlacedItems((prev) => [...prev, found]);
    soundFX.playPush();
  };

  const movePlacedToPool = (key: string) => {
    const found = placedItems.find((p) => p.key === key);
    if (!found) return;
    setPlacedItems((prev) => prev.filter((p) => p.key !== key));
    setPoolItems((prev) => [...prev, found]);
    soundFX.playPop();
  };

  // Stack Simulator interaction
  const sySteps = currentSolution.analysis.shuntingYardSteps;
  const maxSimStep = Math.max(1, sySteps.length - 2);
  const simPrevSnapshot = sySteps[Math.max(0, simStepIndex - 1)];
  const simTargetStep = sySteps[Math.min(simStepIndex, sySteps.length - 1)];

  type SimButtonChoice = 'OUTPUT' | 'PUSH' | 'POP' | 'DISCARD_PAREN';

  const actionMatchesChoice = (action: ShuntingYardAction, choice: SimButtonChoice): boolean => {
    if (choice === 'OUTPUT') return action === 'OUTPUT_OPERAND';
    if (choice === 'PUSH') return action === 'PUSH_OPERATOR' || action === 'PUSH_PAREN';
    if (choice === 'POP') return action === 'POP_OPERATOR' || action === 'FLUSH_STACK';
    if (choice === 'DISCARD_PAREN') return action === 'POP_PAREN_MATCH';
    return false;
  };

  const handleSimChoice = (choice: SimButtonChoice) => {
    if (!simTargetStep) return;

    if (actionMatchesChoice(simTargetStep.action, choice)) {
      if (choice === 'PUSH') soundFX.playPush();
      else if (choice === 'POP' || choice === 'DISCARD_PAREN') soundFX.playPop();
      else soundFX.playStep();

      setSimFeedback(simTargetStep.explanation);

      if (simStepIndex >= maxSimStep) {
        const { total, stars } = computePointsAndStars();
        recordWinAndAdvance(total, stars);
      } else {
        speak(getShuntingYardNarrative(simTargetStep, language));
        setSimStepIndex((s) => s + 1);
      }
    } else {
      handleWrongSubmission(
        `Chose "${choice}" at step ${simStepIndex}`,
        simTargetStep.explanation
      );
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER: MENU / LEVEL SELECT
  // ---------------------------------------------------------------------------
  if (phase === 'MENU') {
    const filteredPreview =
      difficultyFilter === 'all'
        ? GAME_CHALLENGES
        : GAME_CHALLENGES.filter((c) => c.difficulty === difficultyFilter);

    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-[#0F172A]/90 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <Trophy className="w-4 h-4" />
              <span>9-Level Interactive Challenge Quest</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Test Your Notation Mastery
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Convert Infix expressions, evaluate Prefix &amp; Postfix stacks, build token orders
              by hand, and pilot the Shunting-Yard stack. You have{' '}
              <strong className="text-white">3 lives</strong>—every mistake triggers a voiced
              animated replay explaining why.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => startQuest(difficultyFilter)}
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                Start {difficultyFilter === 'all' ? 'Full Quest' : `${difficultyFilter} Pack`}
              </span>
            </button>
          </div>
        </section>

        {/* Difficulty Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/90 border border-slate-800">
            {(['all', 'easy', 'medium', 'hard'] as DifficultyFilter[]).map((diff) => (
              <button
                key={diff}
                type="button"
                onClick={() => setDifficultyFilter(diff)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  difficultyFilter === diff
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {diff === 'all' ? 'All Levels (9)' : diff}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400 font-mono tabular-nums">
            Total Stars Earned:{' '}
            {Object.values(bestStarsByLevel).reduce((sum, s) => sum + s, 0)} /{' '}
            {GAME_CHALLENGES.length * 3}
          </span>
        </div>

        {/* Level Preview Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPreview.map((ch) => {
            const stars = bestStarsByLevel[ch.id] ?? 0;
            const typeLabel =
              ch.type === 'CONVERT'
                ? 'Convert It'
                : ch.type === 'EVALUATE'
                  ? 'Evaluate It'
                  : ch.type === 'DRAG_DROP'
                    ? 'Drag & Drop'
                    : 'Stack Simulator';
            const diffColor =
              ch.difficulty === 'easy'
                ? 'text-emerald-300'
                : ch.difficulty === 'medium'
                  ? 'text-amber-300'
                  : 'text-rose-300';

            return (
              <div
                key={ch.id}
                className="rounded-2xl border border-slate-800 bg-[#0F172A]/85 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Level {ch.level} · <strong className={diffColor}>{ch.difficulty}</strong>
                    </span>
                    <span>{typeLabel}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{ch.title}</h3>
                  <p className="font-mono text-sm text-slate-300 bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-2">
                    {ch.type === 'EVALUATE'
                      ? getChallengeSolution(ch).targetString
                      : ch.infixExpression}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/70">
                  <div className="flex items-center gap-1" aria-label={`${stars} of 3 stars`}>
                    {[1, 2, 3].map((n) => (
                      <Star
                        key={n}
                        className={`w-4 h-4 ${
                          n <= stars ? 'text-amber-400 fill-amber-400' : 'text-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {ch.basePoints} pts · {ch.timeLimitSec}s
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: FINAL SCORE SUMMARY
  // ---------------------------------------------------------------------------
  if (phase === 'SUMMARY') {
    const accuracy = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;
    const totalStars = outcomes.reduce((acc, o) => acc + o.stars, 0);
    const maxStars = activeQueue.length * 3;
    const survived = lives > 0;

    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-[#0F172A]/95 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
                  survived
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                }`}
              >
                {survived ? <Trophy className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {survived ? 'Quest Complete!' : 'Out of Lives — Nice Try!'}
                </h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  {survived
                    ? `You cleared ${correctCount} of ${activeQueue.length} challenges.`
                    : `You reached Level ${levelIdx + 1} of ${activeQueue.length}. Review the missed steps or play again!`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  stop();
                  setPhase('MENU');
                }}
                className="h-11 px-4 rounded-xl border border-slate-700 bg-slate-900 text-slate-200 text-xs font-semibold hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                Level Select
              </button>
              <button
                type="button"
                onClick={() => startQuest(difficultyFilter)}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Play Again</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs text-slate-400">Final Score</p>
              <p className="font-mono text-2xl font-bold text-white mt-1 tabular-nums">{score}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs text-slate-400">Accuracy</p>
              <p className="font-mono text-2xl font-bold text-emerald-300 mt-1 tabular-nums">
                {accuracy}%
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs text-slate-400">Best Streak</p>
              <p className="font-mono text-2xl font-bold text-orange-300 mt-1 tabular-nums">
                {bestStreak}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-xs text-slate-400">Stars Earned</p>
              <p className="font-mono text-2xl font-bold text-amber-300 mt-1 tabular-nums">
                {totalStars} / {maxStars}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Level</th>
                  <th className="py-3 px-4 font-medium">Expression</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Stars</th>
                  <th className="py-3 px-4 font-medium text-right">Points</th>
                  {onSendToLab && <th className="py-3 px-4 font-medium text-right">Study</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {outcomes.map((o, idx) => (
                  <tr key={`${o.level}-${idx}`} className="bg-slate-900/30 text-slate-200">
                    <td className="py-3 px-4 font-medium">
                      {o.level}. {o.title}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">{o.infixExpression}</td>
                    <td className="py-3 px-4">
                      {o.passed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Cleared
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-300">
                          <XCircle className="w-3.5 h-3.5" /> Missed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3].map((n) => (
                          <Star
                            key={n}
                            className={`w-3.5 h-3.5 ${
                              n <= o.stars ? 'text-amber-400 fill-amber-400' : 'text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-right tabular-nums">
                      +{o.pointsEarned}
                    </td>
                    {onSendToLab && (
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            stop();
                            onSendToLab(o.infixExpression);
                          }}
                          className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
                        >
                          Open in Lab
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // TOP HUD (SHARED BY PLAYING & WRONG_REPLAY)
  // ---------------------------------------------------------------------------
  const progressPct = ((levelIdx + (phase === 'WRONG_REPLAY' ? 1 : 0)) / activeQueue.length) * 100;
  const timerPct = Math.max(0, (timeLeft / currentChallenge.timeLimitSec) * 100);

  return (
    <div className="space-y-5">
      {/* Compact Game HUD */}
      <div className="rounded-2xl border border-slate-800 bg-[#0F172A]/95 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs sm:text-sm">
            <span className="font-semibold text-white">
              Level {levelIdx + 1} / {activeQueue.length}
            </span>
            <span className="text-slate-400">·</span>
            <span className="capitalize text-slate-300">{currentChallenge.difficulty}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-300">{currentChallenge.title}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <Award className="w-4 h-4 text-sky-400" />
              <span className="text-slate-400">Score:</span>
              <strong className="text-white">{score}</strong>
            </div>

            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <Flame className={`w-4 h-4 ${streak > 0 ? 'text-orange-400' : 'text-slate-600'}`} />
              <span className="text-slate-400">Streak:</span>
              <strong className="text-orange-300">{streak}</strong>
            </div>

            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <Clock className={`w-4 h-4 ${timeLeft <= 10 ? 'text-rose-400' : 'text-slate-400'}`} />
              <strong className={timeLeft <= 10 ? 'text-rose-300' : 'text-slate-100'}>
                {timeLeft}s
              </strong>
            </div>

            <div className="flex items-center gap-1.5" aria-label={`Lives remaining: ${lives} of 3`}>
              {[1, 2, 3].map((n) => (
                <Heart
                  key={n}
                  className={`w-4 h-4 ${
                    n <= lives ? 'text-rose-500 fill-rose-500' : 'text-slate-700'
                  }`}
                />
              ))}
              <span className="font-mono text-xs text-slate-300 tabular-nums ml-1">
                {lives}/3
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                stop();
                setPhase('MENU');
              }}
              className="text-xs text-slate-400 hover:text-white underline underline-offset-2 ml-2"
            >
              Quit
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  timeLeft <= 10 ? 'bg-rose-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* PHASE: WRONG ANSWER REPLAY                                            */}
      {/* --------------------------------------------------------------------- */}
      {phase === 'WRONG_REPLAY' && wrongInfo && (
        <section className="rounded-2xl border border-rose-500/40 bg-[#0F172A]/95 p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Not quite — Let&apos;s trace the exact steps!
                </h3>
                <p className="text-sm text-slate-300 mt-0.5">{wrongInfo.reason}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleContinueAfterReplay}
              className="h-11 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
            >
              {lives <= 0
                ? 'View Final Score'
                : levelIdx + 1 >= activeQueue.length
                  ? 'Finish Quest'
                  : 'Next Challenge'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5">
              <p className="text-xs text-rose-300">Your Answer</p>
              <p className="font-mono text-base text-rose-100 mt-1">{wrongInfo.userAnswer}</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
              <p className="text-xs text-emerald-300">Correct Answer</p>
              <p className="font-mono text-base text-emerald-100 mt-1 font-bold">
                {wrongInfo.correctAnswer}
              </p>
            </div>
          </div>

          {/* Embedded Step-by-Step Replay */}
          {replaySteps.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/75 p-4 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">
                  Step-by-Step Solution Replay
                </span>
                <span className="font-mono">Infix: {currentChallenge.infixExpression}</span>
              </div>

              {(() => {
                const active = replaySteps[Math.min(replayStepIdx, replaySteps.length - 1)];
                const stackList = 'stack' in active ? active.stack : [];
                const outList = 'output' in active ? active.output : [];

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                        <p className="text-xs text-slate-400 mb-2">Stack</p>
                        <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                          {stackList.length === 0 ? (
                            <span className="text-xs text-slate-500">Empty</span>
                          ) : (
                            stackList.map((item, idx) => (
                              <span
                                key={idx}
                                className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 font-mono text-xs text-slate-100"
                              >
                                {'display' in item ? item.display : item.label}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {outList.length > 0 || !('activeCalculation' in active) ? (
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                          <p className="text-xs text-slate-400 mb-2">Output</p>
                          <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                            {outList.length === 0 ? (
                              <span className="text-xs text-slate-500">Empty</span>
                            ) : (
                              outList.map((tok, idx) => (
                                <span
                                  key={idx}
                                  className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 font-mono text-xs text-emerald-100"
                                >
                                  {tok.display}
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                          <p className="text-xs text-slate-400 mb-2">Active Calculation</p>
                          <p className="font-mono text-xs text-amber-200">
                            {active.activeCalculation?.summary ?? 'Scanning tokens...'}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                      <SpokenText text={currentReplayNarrative} />
                    </div>
                  </div>
                );
              })()}

              <PlaybackControls
                currentStep={replayStepIdx}
                totalSteps={replaySteps.length}
                isPlaying={replayPlaying}
                speed={replaySpeed}
                onTogglePlay={() => {
                  if (replayPlaying) {
                    stop();
                    setReplayPlaying(false);
                    return;
                  }
                  if (replayStepIdx >= replaySteps.length - 1) {
                    setReplayStepIdx(0);
                    setReplayPlaying(true);
                  } else {
                    setReplayPlaying(true);
                  }
                }}
                onPrev={() => {
                  setReplayPlaying(false);
                  const prevIdx = Math.max(0, replayStepIdx - 1);
                  setReplayStepIdx(prevIdx);
                  speak(getReplayNarrative(prevIdx));
                }}
                onNext={() => {
                  setReplayPlaying(false);
                  const nextIdx = Math.min(replaySteps.length - 1, replayStepIdx + 1);
                  setReplayStepIdx(nextIdx);
                  speak(getReplayNarrative(nextIdx));
                }}
                onReset={() => {
                  stop();
                  setReplayPlaying(false);
                  setReplayStepIdx(0);
                }}
                onSpeedChange={setReplaySpeed}
                onSeek={(i) => {
                  setReplayPlaying(false);
                  setReplayStepIdx(i);
                  speak(getReplayNarrative(i));
                }}
                compact
                accentColor="sky"
              />
            </div>
          )}
        </section>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* PHASE: ACTIVE PLAY                                                    */}
      {/* --------------------------------------------------------------------- */}
      {phase === 'PLAYING' && (
        <section className="rounded-2xl border border-slate-800 bg-[#0F172A]/95 p-5 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <span
                className={`text-xs font-semibold ${
                  currentChallenge.targetNotation === 'prefix'
                    ? 'text-orange-300'
                    : 'text-emerald-300'
                }`}
              >
                {currentChallenge.type === 'CONVERT'
                  ? `Convert to ${currentChallenge.targetNotation.toUpperCase()}`
                  : currentChallenge.type === 'EVALUATE'
                    ? `Evaluate ${currentChallenge.targetNotation.toUpperCase()}`
                    : currentChallenge.type === 'DRAG_DROP'
                      ? `Drag & Drop → ${currentChallenge.targetNotation.toUpperCase()}`
                      : 'Interactive Shunting-Yard Simulator'}
              </span>
              <h3 className="text-xl font-semibold text-white">{currentChallenge.prompt}</h3>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !showHint;
                setShowHint(next);
                if (next) {
                  speak(currentChallenge.hint);
                }
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-700 bg-slate-900 text-xs text-slate-300 hover:text-white transition-colors self-start whitespace-nowrap shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
              <span>{showHint ? 'Hide Hint' : 'Hint (-30 pts)'}</span>
            </button>
          </div>

          {showHint && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs sm:text-sm text-amber-100">
              {currentChallenge.hint}
            </div>
          )}

          {/* 1. CONVERT & EVALUATE */}
          {(currentChallenge.type === 'CONVERT' || currentChallenge.type === 'EVALUATE') && (
            <form onSubmit={handleSubmitConvertOrEvaluate} className="space-y-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5 text-center space-y-1.5">
                <p className="text-xs text-slate-400">
                  {currentChallenge.type === 'CONVERT'
                    ? 'Infix Expression'
                    : `${currentChallenge.targetNotation.toUpperCase()} Expression`}
                </p>
                <p className="font-mono text-2xl sm:text-3xl font-bold text-white tracking-wide">
                  {currentChallenge.type === 'CONVERT'
                    ? currentSolution.analysis.validation.normalizedExpression
                    : currentSolution.targetString}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="challenge-answer" className="text-xs font-medium text-slate-300">
                  {currentChallenge.type === 'CONVERT'
                    ? 'Enter space-separated tokens (e.g. 3 4 2 * +)'
                    : 'Enter the final numeric value'}
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="challenge-answer"
                    type={currentChallenge.type === 'EVALUATE' ? 'number' : 'text'}
                    step="any"
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder={
                      currentChallenge.type === 'CONVERT'
                        ? 'Type tokens separated by spaces...'
                        : 'e.g. 12'
                    }
                    autoFocus
                    autoComplete="off"
                    className="flex-1 h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 font-mono text-lg text-white focus:outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30"
                  />
                  <button
                    type="submit"
                    className="h-12 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
                  >
                    Submit Answer
                  </button>
                </div>
              </div>

              {currentChallenge.type === 'CONVERT' && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">Quick tap:</span>
                  {currentSolution.targetTokens
                    .map((t) => t.display)
                    .sort()
                    .map((sym, i) => (
                      <button
                        key={`${sym}-${i}`}
                        type="button"
                        onClick={() =>
                          setTypedAnswer((prev) =>
                            prev.trim().length > 0 ? `${prev.trim()} ${sym}` : sym
                          )
                        }
                        className="h-9 min-w-[38px] px-2.5 rounded-lg border border-slate-800 bg-slate-900 font-mono text-sm text-slate-200 hover:bg-slate-800"
                      >
                        {sym}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setTypedAnswer('')}
                    className="h-9 px-3 rounded-lg border border-slate-800 text-xs text-slate-400 hover:text-white"
                  >
                    Clear
                  </button>
                </div>
              )}
            </form>
          )}

          {/* 2. DRAG & DROP */}
          {currentChallenge.type === 'DRAG_DROP' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-slate-400">Source Infix Expression</p>
                  <p className="font-mono text-xl sm:text-2xl font-bold text-sky-200 mt-0.5">
                    {currentSolution.analysis.validation.normalizedExpression}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  Drag or click tokens below into the target order
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-semibold ${
                      currentChallenge.targetNotation === 'prefix'
                        ? 'text-orange-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    Target {currentChallenge.targetNotation.toUpperCase()} Order
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {placedItems.length} / {currentSolution.targetTokens.length} placed
                  </span>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const drag = draggedKeyRef.current;
                    if (!drag) return;
                    if (drag.from === 'pool') movePoolToPlaced(drag.key);
                    draggedKeyRef.current = null;
                  }}
                  className="min-h-[76px] rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/70 p-3.5 flex flex-wrap items-center gap-2"
                >
                  {placedItems.length === 0 ? (
                    <span className="text-xs text-slate-500 mx-auto">
                      Drop or click tokens here to build the expression...
                    </span>
                  ) : (
                    <AnimatePresence initial={false}>
                      {placedItems.map((item) => (
                        <motion.button
                          key={item.key}
                          type="button"
                          layout
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          draggable
                          onDragStart={() => {
                            draggedKeyRef.current = { key: item.key, from: 'placed' };
                          }}
                          onClick={() => movePlacedToPool(item.key)}
                          title="Click to remove back to bank"
                          className={`h-11 min-w-[44px] px-3.5 rounded-lg font-mono text-base font-bold border transition-colors ${
                            currentChallenge.targetNotation === 'prefix'
                              ? 'border-orange-400/60 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30'
                              : 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30'
                          }`}
                        >
                          {item.token.display}
                        </motion.button>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400">Available Tokens (click or drag)</p>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const drag = draggedKeyRef.current;
                    if (!drag) return;
                    if (drag.from === 'placed') movePlacedToPool(drag.key);
                    draggedKeyRef.current = null;
                  }}
                  className="min-h-[64px] rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 flex flex-wrap items-center gap-2"
                >
                  {poolItems.length === 0 ? (
                    <span className="text-xs text-slate-500">All tokens placed!</span>
                  ) : (
                    poolItems.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        draggable
                        onDragStart={() => {
                          draggedKeyRef.current = { key: item.key, from: 'pool' };
                        }}
                        onClick={() => movePoolToPlaced(item.key)}
                        className="h-11 min-w-[44px] px-3.5 rounded-lg border border-slate-700 bg-slate-800 font-mono text-base font-bold text-slate-100 hover:border-sky-400 hover:bg-slate-700 transition-colors"
                      >
                        {item.token.display}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPoolItems(shuffleTokens(currentSolution.targetTokens));
                    setPlacedItems([]);
                  }}
                  className="h-11 px-4 rounded-xl border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Reset Tokens
                </button>
                <button
                  type="button"
                  disabled={placedItems.length !== currentSolution.targetTokens.length}
                  onClick={handleSubmitDragDrop}
                  className="h-11 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Check Sequence
                </button>
              </div>
            </div>
          )}

          {/* 3. STACK SIMULATOR */}
          {currentChallenge.type === 'STACK_SIM' && simTargetStep && (
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Infix Input Stream</span>
                  <span className="font-mono tabular-nums">
                    Decision {simStepIndex} / {maxSimStep}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {currentSolution.analysis.infixTokens.map((tok, i) => {
                    const isCurr = simTargetStep.currentTokenIndex === i;
                    const isFlushing = simTargetStep.action === 'FLUSH_STACK';
                    const isDone =
                      isFlushing ||
                      (simTargetStep.currentTokenIndex !== null &&
                        i < simTargetStep.currentTokenIndex);
                    return (
                      <span
                        key={`${tok.id}-sim-${i}`}
                        className={`inline-flex items-center justify-center min-w-[38px] h-10 px-2.5 rounded-lg font-mono text-sm font-bold border ${
                          isCurr
                            ? 'border-sky-400 bg-sky-500/25 text-white scale-105'
                            : isDone
                              ? 'border-slate-800 bg-slate-900/40 text-slate-500'
                              : 'border-slate-700 bg-slate-900 text-slate-200'
                        }`}
                      >
                        {tok.display}
                      </span>
                    );
                  })}
                  {simTargetStep.action === 'FLUSH_STACK' && (
                    <span className="px-3 py-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 font-mono text-xs text-amber-200">
                      END OF INPUT
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-300">Current Operator Stack</p>
                  <div className="flex flex-col-reverse gap-1.5 border-b-2 border-x-2 border-slate-800 rounded-b-xl p-3 min-h-[120px] bg-slate-900/40">
                    {(simPrevSnapshot?.stack ?? []).length === 0 ? (
                      <span className="m-auto text-xs text-slate-500">Stack Empty</span>
                    ) : (
                      simPrevSnapshot.stack.map((t, i) => (
                        <div
                          key={`${t.id}-${i}`}
                          className="h-9 px-3 rounded-lg border border-sky-500/40 bg-sky-500/15 font-mono text-sm font-bold text-sky-100 flex items-center justify-between"
                        >
                          <span>{t.display}</span>
                          {i === simPrevSnapshot.stack.length - 1 && (
                            <span className="text-[10px] text-sky-300">TOP</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
                  <p className="text-xs font-semibold text-emerald-300">Postfix Output Queue</p>
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[120px] content-start rounded-xl border border-slate-800/70 p-3 bg-slate-900/40">
                    {(simPrevSnapshot?.output ?? []).length === 0 ? (
                      <span className="text-xs text-slate-500">No tokens emitted yet</span>
                    ) : (
                      simPrevSnapshot.output.map((t, i) => (
                        <span
                          key={`${t.id}-out-${i}`}
                          className="h-9 min-w-[36px] px-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 font-mono text-sm font-bold text-emerald-100 inline-flex items-center justify-center"
                        >
                          {t.display}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {simFeedback && (
                <div className="text-xs text-emerald-300 bg-emerald-950/20 border border-emerald-500/30 rounded-lg px-3.5 py-2">
                  <SpokenText text={simFeedback} className="text-xs text-emerald-200" />
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300">
                  Choose the next Shunting-Yard action
                  {simTargetStep.currentToken && simTargetStep.action !== 'FLUSH_STACK'
                    ? ` for "${simTargetStep.currentToken.display}"`
                    : ' (input finished — flush remaining stack)'}
                  :
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSimChoice('OUTPUT')}
                    className="h-12 px-4 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Send Operand to Output</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimChoice('PUSH')}
                    className="h-12 px-4 rounded-xl border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                    <span>Push onto Stack</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimChoice('POP')}
                    className="h-12 px-4 rounded-xl border border-orange-500/40 bg-orange-500/15 hover:bg-orange-500/25 text-orange-100 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <ArrowUpFromLine className="w-4 h-4" />
                    <span>Pop Top to Output</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSimChoice('DISCARD_PAREN')}
                    className="h-12 px-4 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Discard Matching &quot;(&quot;</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
