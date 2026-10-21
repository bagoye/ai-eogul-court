import { useCallback, useEffect, useRef, useState } from 'react';
import { castVoices, STYLE, type Role } from './voices';

export interface Line {
  id: string;
  speaker: string;
  content: string;
}
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Chrome fills the voice list asynchronously; wait briefly so the first line is not misvoiced.
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      speechSynthesis.removeEventListener?.('voiceschanged', done);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener?.('voiceschanged', done);
    setTimeout(done, 800);
  });
}
// Chrome stops long utterances after ~15s, so speak sentence by sentence.
const sentences = (text: string) =>
  text
    .match(/[^.!?。…]+[.!?。…]*/gu)
    ?.map((s) => s.trim())
    .filter(Boolean) || [text];

export function useNarrator() {
  const [speaking, setSpeaking] = useState<Line | null>(null);
  const generation = useRef(0);
  const stop = useCallback(() => {
    generation.current++;
    if (canSpeak) speechSynthesis.cancel();
    setSpeaking(null);
  }, []);
  const speak = useCallback(
    async (lines: Line[], onDone?: () => void) => {
      stop();
      if (!canSpeak || !lines.length) return;
      const token = generation.current;
      const cast = castVoices(await loadVoices());
      if (token !== generation.current) return;
      const parts = lines.flatMap((line) =>
        sentences(line.content).map((text, i) => ({ line, text, first: i === 0 })),
      );
      parts.forEach(({ line, text, first }, i) => {
        const role = (line.speaker in STYLE ? line.speaker : 'judge') as Role;
        const style = STYLE[role];
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ko-KR';
        const voice = cast[role];
        if (voice) u.voice = voice;
        u.pitch = style.pitch;
        u.rate = style.rate;
        if (first)
          u.onstart = () => {
            if (token === generation.current) setSpeaking(line);
          };
        if (i === parts.length - 1)
          u.onend = () => {
            if (token !== generation.current) return;
            setSpeaking(null);
            onDone?.();
          };
        u.onerror = () => {
          if (token === generation.current) setSpeaking(null);
        };
        speechSynthesis.speak(u);
      });
    },
    [stop],
  );
  useEffect(() => {
    if (!canSpeak) return;
    // Voices load asynchronously in Chrome; touching the list starts that load early.
    speechSynthesis.getVoices();
    return () => {
      generation.current++;
      speechSynthesis.cancel();
    };
  }, []);
  return { speak, stop, speaking };
}

const KEY = 'court-voice';
export function useVoicePreference() {
  const [on, setOn] = useState(() => {
    try {
      return canSpeak && localStorage.getItem(KEY) !== 'off';
    } catch {
      return canSpeak;
    }
  });
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem(KEY, v ? 'off' : 'on');
      } catch {
        /* Storage is optional. */
      }
      return !v;
    });
  return [on, toggle] as const;
}
