import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  mapSpokenIndexToDisplayRange,
  NarratorLanguage,
  prepareSpeechFromDisplay,
} from '../utils/speechText';

interface SpeakOptions {
  onEnd?: () => void;
  /** Optional override text to speak if different from displayText */
  spokenOverride?: string;
}

interface VoiceNarratorContextValue {
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  setSelectedVoiceURI: (uri: string) => void;
  language: NarratorLanguage;
  setLanguage: (lang: NarratorLanguage) => void;
  hasArabicVoice: boolean;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  rate: number;
  setRate: (rate: number) => void;
  isSpeaking: boolean;
  activeDisplayText: string | null;
  highlightRange: [number, number] | null;
  speak: (displayText: string, options?: SpeakOptions) => void;
  stop: () => void;
  registerReplayHandler: (fn: (() => void) | null) => void;
  replayCurrentStep: () => void;
  hasReplayHandler: boolean;
}

const VoiceNarratorContext = createContext<VoiceNarratorContextValue | null>(null);

function pickDefaultVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  lang: NarratorLanguage
): string {
  if (voices.length === 0) return '';
  if (lang === 'ar') {
    const arVoice = voices.find((v) => v.lang.toLowerCase().startsWith('ar'));
    if (arVoice) return arVoice.voiceURI;
  } else {
    const preferredEn =
      voices.find(
        (v) =>
          v.lang.toLowerCase().startsWith('en') &&
          (v.localService || /natural|google|samantha|daniel|aria/i.test(v.name))
      ) || voices.find((v) => v.lang.toLowerCase().startsWith('en'));
    if (preferredEn) return preferredEn.voiceURI;
  }
  return voices[0].voiceURI;
}

export function VoiceNarratorProvider({ children }: { children: ReactNode }) {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined';

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [language, setLanguageState] = useState<NarratorLanguage>('en');
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [muted, setMutedState] = useState<boolean>(false);
  const [rate, setRate] = useState<number>(1.0);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [activeDisplayText, setActiveDisplayText] = useState<string | null>(null);
  const [highlightRange, setHighlightRange] = useState<[number, number] | null>(null);
  const [hasReplayHandler, setHasReplayHandler] = useState<boolean>(false);

  const tokenRef = useRef<number>(0);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  const safetyTimerRef = useRef<number | null>(null);
  const replayHandlerRef = useRef<(() => void) | null>(null);

  // Load voices asynchronously (Chrome/Safari fire voiceschanged after mount)
  useEffect(() => {
    if (!supported) return;

    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) {
        setVoices(list);
        setSelectedVoiceURI((prev) => {
          if (prev && list.some((v) => v.voiceURI === prev)) return prev;
          return pickDefaultVoiceForLanguage(list, language);
        });
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [supported, language]);

  const hasArabicVoice = useMemo(
    () => voices.some((v) => v.lang.toLowerCase().startsWith('ar')),
    [voices]
  );

  const clearTimers = () => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (safetyTimerRef.current !== null) {
      window.clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    tokenRef.current += 1;
    clearTimers();
    activeUtteranceRef.current = null;
    if (supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser speech cancellation errors
      }
    }
    setIsSpeaking(false);
    setHighlightRange(null);
    setActiveDisplayText(null);
  }, [supported]);

  // Cancel speech on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const setMuted = useCallback(
    (next: boolean) => {
      setMutedState(next);
      if (next) {
        stop();
      }
    },
    [stop]
  );

  const toggleMuted = useCallback(() => {
    setMuted(!muted);
  }, [muted, setMuted]);

  const setLanguage = useCallback(
    (nextLang: NarratorLanguage) => {
      stop();
      setLanguageState(nextLang);
      setSelectedVoiceURI(pickDefaultVoiceForLanguage(voices, nextLang));
    },
    [stop, voices]
  );

  const speak = useCallback(
    (displayText: string, options?: SpeakOptions) => {
      const cleaned = displayText.trim();
      if (!cleaned) {
        options?.onEnd?.();
        return;
      }

      // Always stop any prior utterance immediately
      tokenRef.current += 1;
      const myToken = tokenRef.current;
      clearTimers();

      if (supported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }

      if (muted || !supported) {
        setIsSpeaking(false);
        setActiveDisplayText(null);
        setHighlightRange(null);
        return;
      }

      const prepared = prepareSpeechFromDisplay(cleaned, language);
      const textToSpeak = options?.spokenOverride ?? prepared.spokenText;

      setActiveDisplayText(cleaned);
      setHighlightRange(null);
      setIsSpeaking(true);

      // Brief 20ms defer avoids Chromium cancel()+speak() race bug
      pendingTimerRef.current = window.setTimeout(() => {
        if (myToken !== tokenRef.current) return;

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        activeUtteranceRef.current = utterance;

        const chosenVoice = voices.find((v) => v.voiceURI === selectedVoiceURI);
        if (chosenVoice) {
          utterance.voice = chosenVoice;
          utterance.lang = chosenVoice.lang;
        } else {
          utterance.lang = language === 'ar' ? 'ar-SA' : 'en-US';
        }

        utterance.rate = Math.min(2.0, Math.max(0.5, rate));
        utterance.pitch = 1.0;

        const finishUtterance = (invokeOnEnd: boolean) => {
          if (myToken !== tokenRef.current) return;
          clearTimers();
          activeUtteranceRef.current = null;
          setIsSpeaking(false);
          setHighlightRange(null);
          setActiveDisplayText(null);
          if (invokeOnEnd) {
            options?.onEnd?.();
          }
        };

        utterance.onboundary = (event: SpeechSynthesisEvent) => {
          if (myToken !== tokenRef.current) return;
          if (!options?.spokenOverride && typeof event.charIndex === 'number') {
            const range = mapSpokenIndexToDisplayRange(prepared, event.charIndex);
            if (range) {
              setHighlightRange(range);
            }
          }
        };

        utterance.onend = () => finishUtterance(true);
        utterance.onerror = () => finishUtterance(true);

        // Safety timeout in case a browser voice hangs without firing onend
        const estDurationMs = Math.max(
          4500,
          Math.round((textToSpeak.length / Math.max(rate, 0.5)) * 110) + 2500
        );
        safetyTimerRef.current = window.setTimeout(() => {
          finishUtterance(true);
        }, estDurationMs);

        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          finishUtterance(true);
        }
      }, 20);
    },
    [supported, muted, language, voices, selectedVoiceURI, rate]
  );

  const registerReplayHandler = useCallback((fn: (() => void) | null) => {
    replayHandlerRef.current = fn;
    setHasReplayHandler(Boolean(fn));
  }, []);

  const replayCurrentStep = useCallback(() => {
    if (muted) {
      setMutedState(false);
    }
    replayHandlerRef.current?.();
  }, [muted]);

  const value: VoiceNarratorContextValue = {
    supported,
    voices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    language,
    setLanguage,
    hasArabicVoice,
    muted,
    setMuted,
    toggleMuted,
    rate,
    setRate,
    isSpeaking,
    activeDisplayText,
    highlightRange,
    speak,
    stop,
    registerReplayHandler,
    replayCurrentStep,
    hasReplayHandler,
  };

  return (
    <VoiceNarratorContext.Provider value={value}>
      {children}
    </VoiceNarratorContext.Provider>
  );
}

export function useVoiceNarrator(): VoiceNarratorContextValue {
  const ctx = useContext(VoiceNarratorContext);
  if (!ctx) {
    throw new Error('useVoiceNarrator must be used within a VoiceNarratorProvider');
  }
  return ctx;
}
