import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';

interface PlaybackControlsProps {
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek?: (stepIndex: number) => void;
  accentColor?: 'sky' | 'orange' | 'emerald';
  compact?: boolean;
}

export function PlaybackControls({
  currentStep,
  totalSteps,
  isPlaying,
  speed,
  onTogglePlay,
  onPrev,
  onNext,
  onReset,
  onSpeedChange,
  onSeek,
  accentColor = 'sky',
  compact = false,
}: PlaybackControlsProps) {
  const maxStep = Math.max(0, totalSteps - 1);
  const progressPct = maxStep > 0 ? (currentStep / maxStep) * 100 : 100;

  const accentClasses = {
    sky: {
      btn: 'bg-sky-500 hover:bg-sky-400 text-slate-950 focus-visible:ring-sky-400',
      bar: 'bg-sky-400',
      slider: 'accent-sky-400',
    },
    orange: {
      btn: 'bg-orange-500 hover:bg-orange-400 text-slate-950 focus-visible:ring-orange-400',
      bar: 'bg-orange-400',
      slider: 'accent-orange-400',
    },
    emerald: {
      btn: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 focus-visible:ring-emerald-400',
      bar: 'bg-emerald-400',
      slider: 'accent-emerald-400',
    },
  }[accentColor];

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-slate-800/90 bg-slate-900/70 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      {/* Scrubbable step bar */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-slate-400 whitespace-nowrap tabular-nums">
          Step {Math.min(currentStep + 1, Math.max(1, totalSteps))} / {Math.max(1, totalSteps)}
        </span>
        <div className="relative flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-150 ${accentClasses.bar}`}
            style={{ width: `${progressPct}%` }}
          />
          {onSeek && maxStep > 0 && (
            <input
              type="range"
              min={0}
              max={maxStep}
              value={currentStep}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Scrub animation step"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          )}
        </div>
      </div>

      {/* Buttons & Speed */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            aria-label="Reset animation"
            title="Reset"
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg border border-slate-700/80 bg-slate-800/80 text-slate-200 hover:bg-slate-700 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onPrev}
            disabled={currentStep <= 0}
            aria-label="Previous step"
            title="Previous Step"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-slate-700/80 bg-slate-800/80 text-slate-200 text-xs font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <SkipBack className="w-4 h-4" />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={totalSteps <= 1}
            className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 ${accentClasses.btn} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>{currentStep >= maxStep ? 'Replay' : 'Play'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={currentStep >= maxStep}
            aria-label="Next step"
            title="Next Step"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-slate-700/80 bg-slate-800/80 text-slate-200 text-xs font-medium hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <span className="hidden sm:inline">Next</span>
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Speed slider with explicit label & numeric readout */}
        <label className="flex items-center gap-2.5 text-xs text-slate-300">
          <span className="whitespace-nowrap text-slate-400">
            Speed: <strong className="font-mono text-slate-100 tabular-nums">{speed.toFixed(1)}x</strong>
          </span>
          <input
            type="range"
            min={0.5}
            max={2.5}
            step={0.25}
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            aria-label="Playback speed multiplier"
            className={`w-24 sm:w-28 cursor-pointer ${accentClasses.slider}`}
          />
        </label>
      </div>
    </div>
  );
}
