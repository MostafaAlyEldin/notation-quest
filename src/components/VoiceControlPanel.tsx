import { Globe, RotateCw, Volume2, VolumeX } from 'lucide-react';
import { useVoiceNarrator } from '../context/VoiceNarratorContext';

export function VoiceControlPanel() {
  const {
    supported,
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    language,
    setLanguage,
    hasArabicVoice,
    muted,
    toggleMuted,
    rate,
    setRate,
    isSpeaking,
    replayCurrentStep,
    hasReplayHandler,
  } = useVoiceNarrator();

  if (!supported) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2.5 text-xs text-slate-400 flex items-center justify-between">
        <span>Voice Narrator (Web Speech API) is not supported in this browser.</span>
      </div>
    );
  }

  // Prefer matching language voices first, then others
  const matchingVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(language)
  );
  const displayVoices = matchingVoices.length > 0 ? matchingVoices : voices;

  return (
    <section
      aria-label="Voice narrator controls"
      className="rounded-xl border border-slate-800/90 bg-[#0F172A]/85 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
    >
      {/* Left: Label + Mute/Unmute + Replay Step */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">
          Voice Narrator
        </span>

        <button
          type="button"
          onClick={toggleMuted}
          aria-pressed={!muted}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            muted
              ? 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
              : isSpeaking
                ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
          }`}
        >
          {muted ? (
            <>
              <VolumeX className="w-3.5 h-3.5" />
              <span>Muted</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isSpeaking ? 'Speaking' : 'Unmuted'}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={replayCurrentStep}
          disabled={!hasReplayHandler}
          title="Speak current step again"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-700/80 bg-slate-900 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <RotateCw className="w-3.5 h-3.5 text-sky-400" />
          <span>Replay Step</span>
        </button>
      </div>

      {/* Right: Speed Slider + Voice Picker + EN/AR Switch */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Speed Slider (0.5x - 2.0x) */}
        <label className="inline-flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap">
          <span className="text-slate-400">
            Voice: <strong className="font-mono text-slate-100 tabular-nums">{rate.toFixed(1)}x</strong>
          </span>
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-label="Voice narration speed"
            className="w-20 sm:w-24 accent-sky-400 cursor-pointer"
          />
        </label>

        {/* Voice Picker */}
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <span className="sr-only">Select speech voice</span>
          <select
            value={selectedVoiceURI}
            onChange={(e) => setSelectedVoiceURI(e.target.value)}
            aria-label="Narrator voice"
            className="h-8 max-w-[180px] sm:max-w-[210px] rounded-lg border border-slate-700/80 bg-slate-950 px-2.5 text-xs text-slate-200 focus:outline-none focus:border-sky-400"
          >
            {displayVoices.length === 0 ? (
              <option value="">Default System Voice</option>
            ) : (
              displayVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))
            )}
          </select>
        </label>

        {/* English / Arabic Switch */}
        <div
          role="group"
          aria-label="Narration language"
          className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-800 bg-slate-950"
        >
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              language === 'en'
                ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <Globe className="w-3 h-3" />
            <span>EN</span>
          </button>
          <button
            type="button"
            onClick={() => setLanguage('ar')}
            title={
              hasArabicVoice
                ? 'Switch to Arabic narration'
                : 'Arabic text mode (no Arabic system voice detected)'
            }
            className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              language === 'ar'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            <span>العربية</span>
          </button>
        </div>
      </div>
    </section>
  );
}
