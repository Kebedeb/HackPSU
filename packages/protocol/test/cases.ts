import type { CaseInput, Decision } from '@aman/types';

export interface TableCase {
  name: string;
  input: CaseInput;
  outcome: Decision;
  reasons: string[];
  needsHumanReview?: boolean;
  missing?: string[];
}

type Overrides = {
  age?: number | null;
  ageApproximate?: boolean;
  rate?: number | null;
  s?: Partial<CaseInput['symptoms']>;
};

/** A fully answered, synthetic child with no concerning signs. */
export function mk(o: Overrides = {}): CaseInput {
  return {
    patient: { ageMonths: o.age === undefined ? 24 : o.age, ...(o.ageApproximate ? { ageApproximate: true } : {}) },
    breathRatePerMin: o.rate === undefined ? 30 : o.rate,
    symptoms: {
      cough: false,
      coughDays: null,
      fever: false,
      difficultyBreathing: false,
      chestIndrawing: false,
      stridorWhenCalm: false,
      unableToDrinkOrFeed: false,
      vomitsEverything: false,
      convulsions: false,
      unusuallySleepyOrUnconscious: false,
      diarrhea: false,
      ...o.s,
    },
  };
}

const cough = (days = 3) => ({ cough: true, coughDays: days });

export const TABLE: TableCase[] = [
  { name: 'well child, all answered', input: mk(), outcome: 'HOME', reasons: ['no_concerning_signs'], needsHumanReview: false },
  { name: 'cough 3 days, normal rate at 24 months', input: mk({ rate: 30, s: cough() }), outcome: 'HOME', reasons: ['no_concerning_signs'] },

  { name: 'danger sign: unable to drink', input: mk({ s: { unableToDrinkOrFeed: true } }), outcome: 'GO_NOW', reasons: ['danger_sign_unableToDrinkOrFeed'] },
  { name: 'danger sign: vomits everything', input: mk({ s: { vomitsEverything: true } }), outcome: 'GO_NOW', reasons: ['danger_sign_vomitsEverything'] },
  { name: 'danger sign: convulsions', input: mk({ s: { convulsions: true } }), outcome: 'GO_NOW', reasons: ['danger_sign_convulsions'] },
  { name: 'danger sign: sleepy or unconscious', input: mk({ s: { unusuallySleepyOrUnconscious: true } }), outcome: 'GO_NOW', reasons: ['danger_sign_unusuallySleepyOrUnconscious'] },
  {
    name: 'two danger signs list both, lower tiers dropped',
    input: mk({ s: { convulsions: true, vomitsEverything: true, diarrhea: true } }),
    outcome: 'GO_NOW',
    reasons: ['danger_sign_vomitsEverything', 'danger_sign_convulsions'],
  },
  { name: 'stridor when calm at 24 months', input: mk({ s: { stridorWhenCalm: true } }), outcome: 'GO_NOW', reasons: ['stridor_when_calm'] },
  { name: 'stridor when calm in a young infant', input: mk({ age: 1, rate: 40, s: { stridorWhenCalm: true } }), outcome: 'GO_NOW', reasons: ['stridor_when_calm'] },
  {
    name: 'stridor with unknown age stays urgent',
    input: mk({ age: null, s: { stridorWhenCalm: true } }),
    outcome: 'GO_NOW',
    reasons: ['stridor_when_calm'],
    needsHumanReview: true,
    missing: ['ageMonths'],
  },

  { name: 'young infant 1 month, chest indrawing', input: mk({ age: 1, rate: 40, s: { chestIndrawing: true } }), outcome: 'GO_NOW', reasons: ['young_infant_chest_indrawing'] },
  { name: 'young infant 1 month, rate 60 (at cutoff), no cough', input: mk({ age: 1, rate: 60 }), outcome: 'GO_NOW', reasons: ['young_infant_fast_breathing'] },
  { name: 'young infant 1 month, rate 59 (one below)', input: mk({ age: 1, rate: 59 }), outcome: 'HOME', reasons: ['no_concerning_signs'] },
  { name: 'young infant fever', input: mk({ age: 1, rate: 40, s: { fever: true } }), outcome: 'GO_NOW', reasons: ['young_infant_fever'] },
  {
    name: 'young infant with unknown breath rate needs review',
    input: mk({ age: 1, rate: null }),
    outcome: 'REFER_SOON',
    reasons: ['missing_critical_data'],
    needsHumanReview: true,
    missing: ['breathRatePerMin'],
  },

  { name: 'boundary: exactly 2 months uses 50, rate 50 with cough', input: mk({ age: 2, rate: 50, s: cough() }), outcome: 'REFER_SOON', reasons: ['fast_breathing'] },
  { name: 'boundary: exactly 2 months uses 50, rate 55 with cough', input: mk({ age: 2, rate: 55, s: cough() }), outcome: 'REFER_SOON', reasons: ['fast_breathing'] },
  { name: 'boundary: exactly 2 months, rate 49 (one below 50)', input: mk({ age: 2, rate: 49, s: cough() }), outcome: 'HOME', reasons: ['no_concerning_signs'] },
  { name: '6 months, rate 50 (at cutoff) with cough', input: mk({ age: 6, rate: 50, s: cough() }), outcome: 'REFER_SOON', reasons: ['fast_breathing'] },
  { name: '6 months, rate 49 (one below) with cough', input: mk({ age: 6, rate: 49, s: cough() }), outcome: 'HOME', reasons: ['no_concerning_signs'] },
  { name: 'boundary: exactly 12 months uses 40, rate 40', input: mk({ age: 12, rate: 40, s: cough() }), outcome: 'REFER_SOON', reasons: ['fast_breathing'] },
  { name: 'boundary: exactly 12 months, rate 39', input: mk({ age: 12, rate: 39, s: cough() }), outcome: 'HOME', reasons: ['no_concerning_signs'] },
  { name: '59 months, rate 40 with difficult breathing', input: mk({ age: 59, rate: 40, s: { difficultyBreathing: true } }), outcome: 'REFER_SOON', reasons: ['fast_breathing'] },
  {
    name: 'older child fast rate without cough or difficult breathing is not counted',
    input: mk({ age: 24, rate: 45 }),
    outcome: 'HOME',
    reasons: ['no_concerning_signs'],
  },
  {
    name: '60 months is outside the chart',
    input: mk({ age: 60 }),
    outcome: 'REFER_SOON',
    reasons: ['age_outside_range'],
    needsHumanReview: true,
  },

  { name: 'chest indrawing at 24 months', input: mk({ s: { chestIndrawing: true } }), outcome: 'REFER_SOON', reasons: ['chest_indrawing'] },
  { name: 'cough 15 days', input: mk({ s: cough(15) }), outcome: 'REFER_SOON', reasons: ['cough_more_than_14_days'] },
  { name: 'cough exactly 14 days', input: mk({ s: cough(14) }), outcome: 'HOME', reasons: ['no_concerning_signs'] },
  { name: 'fever at 24 months needs chart assessment', input: mk({ s: { fever: true } }), outcome: 'REFER_SOON', reasons: ['fever_needs_chart_assessment'] },
  { name: 'diarrhoea needs dehydration check', input: mk({ s: { diarrhea: true } }), outcome: 'REFER_SOON', reasons: ['diarrhea_needs_dehydration_check'] },

  {
    name: 'null age never gives HOME',
    input: mk({ age: null }),
    outcome: 'REFER_SOON',
    reasons: ['missing_critical_data'],
    needsHumanReview: true,
    missing: ['ageMonths'],
  },
  {
    name: 'null danger sign never gives HOME',
    input: mk({ s: { convulsions: null } }),
    outcome: 'REFER_SOON',
    reasons: ['missing_critical_data'],
    needsHumanReview: true,
    missing: ['convulsions'],
  },
  {
    name: 'null danger sign does not hide a known GO_NOW',
    input: mk({ s: { convulsions: null, vomitsEverything: true } }),
    outcome: 'GO_NOW',
    reasons: ['danger_sign_vomitsEverything'],
    needsHumanReview: true,
    missing: ['convulsions'],
  },
  {
    name: 'cough without breath rate or duration needs review',
    input: mk({ rate: null, s: { cough: true, coughDays: null } }),
    outcome: 'REFER_SOON',
    reasons: ['missing_critical_data'],
    needsHumanReview: true,
    missing: ['breathRatePerMin', 'coughDays'],
  },
  {
    name: 'approximate age flags review but keeps the rule outcome',
    input: mk({ age: 12, ageApproximate: true }),
    outcome: 'HOME',
    reasons: ['no_concerning_signs'],
    needsHumanReview: true,
  },
];
