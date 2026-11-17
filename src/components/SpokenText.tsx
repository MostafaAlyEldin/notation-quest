import { Volume2 } from 'lucide-react';
import { useVoiceNarrator } from '../context/VoiceNarratorContext';

interface SpokenTextProps {
  text: string;
  className?: string;
}

/**
 * Renders explanation text and highlights the exact word/symbol currently being
 * narrated via Web Speech API `onboundary` events (with clean full-sentence
 * highlight fallback when a browser voice does not emit boundary events).
 */
export function SpokenText({ text, className = '' }: SpokenTextProps) {
  const { isSpeaking, activeDisplayText, highlightRange, language } = useVoiceNarrator();
  const isActive = isSpeaking && activeDisplayText === text;

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (!isActive) {
    return (
      <p dir={dir} className={`text-sm text-slate-100 leading-relaxed ${className}`}>
        {text}
      </p>
    );
  }

  // Word-level highlight if boundary offsets exist
  if (highlightRange) {
    const [start, end] = highlightRange;
    const before = text.slice(0, start);
    const word = text.slice(start, end);
    const after = text.slice(end);

    return (
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
          <Volume2 className="w-3.5 h-3.5" />
          <span>{language === 'ar' ? 'يتحدث الآن' : 'Narrating'}</span>
        </div>
        <p dir={dir} className={`text-sm text-slate-200 leading-relaxed ${className}`}>
          <span>{before}</span>
          <mark className="bg-sky-400/30 text-white font-semibold rounded px-1 py-0.5 ring-1 ring-sky-400/50">
            {word}
          </mark>
          <span>{after}</span>
        </p>
      </div>
    );
  }

  // Fallback highlight for voices without onboundary support
  return (
    <div className="space-y-1.5">
      <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
        <Volume2 className="w-3.5 h-3.5" />
        <span>{language === 'ar' ? 'يتحدث الآن' : 'Narrating'}</span>
      </div>
      <p
        dir={dir}
        className={`text-sm text-sky-100 bg-sky-500/15 border border-sky-400/30 rounded-lg px-2.5 py-1.5 leading-relaxed ${className}`}
      >
        {text}
      </p>
    </div>
  );
}
