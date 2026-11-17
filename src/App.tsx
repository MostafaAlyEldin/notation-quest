import { useMemo, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  analyzeExpression,
  DEFAULT_VARIABLES,
  PRESET_EXPRESSIONS,
  VariableMap,
} from './engine';
import { ExpressionWorkbench } from './components/ExpressionWorkbench';
import { LearnMode } from './components/LearnMode';
import { ConversionVisualizer } from './components/ConversionVisualizer';
import { EvaluationVisualizer } from './components/EvaluationVisualizer';
import { GameMode } from './components/GameMode';
import { VoiceControlPanel } from './components/VoiceControlPanel';
import { VoiceNarratorProvider, useVoiceNarrator } from './context/VoiceNarratorContext';
import { soundFX } from './utils/sound';

type AppMode = 'learn' | 'convert' | 'evaluate' | 'game';

const NAV_ITEMS: Array<{ id: AppMode; label: string }> = [
  { id: 'learn', label: 'Learn' },
  { id: 'convert', label: 'Convert' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'game', label: 'Game Mode' },
];

function NotationQuestShell() {
  const [mode, setMode] = useState<AppMode>('learn');
  const [expression, setExpression] = useState<string>(PRESET_EXPRESSIONS[0].expression);
  const [variables, setVariables] = useState<VariableMap>(DEFAULT_VARIABLES);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const { stop } = useVoiceNarrator();

  const analysis = useMemo(
    () => analyzeExpression(expression, variables),
    [expression, variables]
  );

  const handleModeChange = (nextMode: AppMode) => {
    stop();
    setMode(nextMode);
  };

  const handleExpressionChange = (nextExpr: string) => {
    stop();
    setExpression(nextExpr);
  };

  const handleVariableChange = (name: string, value: number) => {
    stop();
    setVariables((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFX.setEnabled(next);
    if (next) soundFX.playStep();
  };

  const handleSendToLab = (expr: string) => {
    stop();
    setExpression(expr);
    setMode('convert');
  };

  return (
    <div className="min-h-screen bg-[#090E1A] text-slate-100 flex flex-col">
      {/* Top Bar: 3-zone single-row header */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#090E1A]/90 backdrop-blur-md">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleModeChange('learn');
            }}
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Notation Quest
          </a>

          {/* Zone 2: Primary Mode Links */}
          <nav
            aria-label="Primary sections"
            className="flex items-center gap-4 sm:gap-7 overflow-x-auto no-scrollbar"
          >
            {NAV_ITEMS.map((item) => {
              const isActive = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleModeChange(item.id)}
                  className={`relative py-5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:text-sky-300 ${
                    isActive
                      ? 'text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-400 rounded-full"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single utility action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleToggleSound}
              aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-800 bg-slate-900/90 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4 text-sky-400" />
              ) : (
                <VolumeX className="w-4 h-4 text-slate-500" />
              )}
              <span className="hidden sm:inline">
                {soundEnabled ? 'SFX On' : 'SFX Off'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Compact Voice Narrator Control Strip */}
        <VoiceControlPanel />

        {mode !== 'game' && (
          <>
            {/* Focused Editorial Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <h1 className="font-display text-2xl sm:text-4xl font-bold text-white tracking-tight text-balance">
                  Infix, Prefix &amp; Postfix Visual Lab
                </h1>
                <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                  Explore how computers parse and evaluate arithmetic expressions using binary trees,
                  the Shunting-Yard operator stack, and stack machines.
                </p>
              </div>

              <div className="flex items-center gap-5 text-xs text-slate-400 shrink-0">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
                  <span className="text-sky-300 font-medium">Infix</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-400 inline-block" />
                  <span className="text-orange-300 font-medium">Prefix</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />
                  <span className="text-emerald-300 font-medium">Postfix</span>
                </span>
              </div>
            </div>

            <ExpressionWorkbench
              expression={expression}
              onExpressionChange={handleExpressionChange}
              variables={variables}
              onVariableChange={handleVariableChange}
              analysis={analysis}
            />
          </>
        )}

        {mode === 'learn' && <LearnMode analysis={analysis} />}
        {mode === 'convert' && <ConversionVisualizer analysis={analysis} />}
        {mode === 'evaluate' && <EvaluationVisualizer analysis={analysis} />}
        {mode === 'game' && <GameMode onSendToLab={handleSendToLab} />}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/70 py-5 mt-8">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>Notation Quest · Interactive Expression Tree &amp; Stack Trainer</span>
          <span>Infix · Polish (Prefix) · Reverse Polish (Postfix)</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <VoiceNarratorProvider>
      <NotationQuestShell />
    </VoiceNarratorProvider>
  );
}
