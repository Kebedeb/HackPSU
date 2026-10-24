import { describe, expect, it } from 'vitest';
import { REASON_KEYS } from '@aman/protocol';
import { caregiverCard, STRINGS } from '../src/index';

describe('bundled content', () => {
  it('every reason key has text in every language', () => {
    for (const lang of ['en', 'ur', 'am'] as const) {
      for (const k of REASON_KEYS) expect(STRINGS[lang][`reason_${k}`], `${lang} ${k}`).toBeTruthy();
    }
  });

  it('every language has every English key', () => {
    for (const lang of ['ur', 'am'] as const) {
      for (const k of Object.keys(STRINGS.en)) expect(STRINGS[lang][k], `${lang} ${k}`).toBeTruthy();
    }
  });

  it('never names a diagnosis or a detected disease', () => {
    const all = JSON.stringify(STRINGS).toLowerCase();
    expect(all).not.toMatch(/pneumonia|detects/);
  });

  it('caregiver card never contains a dose', () => {
    for (const outcome of ['HOME', 'REFER_SOON', 'GO_NOW'] as const) {
      const card = caregiverCard('en', outcome, { cough: true, diarrhea: true, difficultyBreathing: false });
      expect(JSON.stringify(card)).not.toMatch(/\d+\s?(mg|ml|tablet)/i);
    }
  });

  it('caregiver card for non-English is flagged as a draft', () => {
    expect(caregiverCard('ur', 'HOME', { cough: false, diarrhea: false, difficultyBreathing: false }).draft).toBe(true);
  });
});
