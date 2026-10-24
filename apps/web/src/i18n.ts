import { createContext, useContext } from 'react';
import { RTL, t as translate } from '@aman/content';
import type { Lang } from '@aman/types';

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function useT() {
  const { lang, setLang } = useContext(LangContext);
  return { lang, setLang, t: (key: string) => translate(lang, key), dir: RTL[lang] ? ('rtl' as const) : ('ltr' as const) };
}

const SPEECH_LANG: Record<Lang, string> = { en: 'en-US', ur: 'ur-PK', am: 'am-ET' };

/** Plays a recorded prompt if one is bundled, else falls back to the device voice (Urdu and Amharic voices vary by device). */
export async function speak(lang: Lang, promptKey: string, text: string): Promise<void> {
  try {
    const audio = new Audio(`/audio/${lang}/${promptKey}.mp3`);
    await audio.play();
    return;
  } catch {
    // no recorded prompt for this key yet
  }
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH_LANG[lang];
  window.speechSynthesis.speak(u);
}
