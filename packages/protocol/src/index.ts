import { z } from 'zod';
import {
  DECISIONS,
  OUTCOME_RANK,
  SYMPTOM_KEYS,
  type BooleanSymptomKey,
  type CaseInput,
  type Decision,
  type DecisionResult,
} from '@aman/types';
import rawProtocol from '../protocol.json' with { type: 'json' };
import rawClinics from '../clinics.json' with { type: 'json' };

export const CONDITIONS = [
  'ANY_DANGER_SIGN',
  'STRIDOR_WHEN_CALM',
  'STRIDOR_YOUNG_INFANT',
  'YOUNG_INFANT_CHEST_INDRAWING',
  'YOUNG_INFANT_FAST_BREATHING',
  'YOUNG_INFANT_FEVER',
  'CHEST_INDRAWING',
  'FAST_BREATHING',
  'COUGH_MORE_THAN_DAYS',
  'FEVER_NEEDS_ASSESSMENT',
  'DIARRHEA_NEEDS_DEHYDRATION_CHECK',
  'AGE_OUTSIDE_RANGE',
  'NO_CONCERNING_SIGNS',
] as const;
type Condition = (typeof CONDITIONS)[number];

const CONDITIONAL_TRIGGERS = ['COUGH_OR_DIFFICULT_BREATHING', 'YOUNG_INFANT', 'COUGH'] as const;
const CRITICAL_FIELD_NAMES = ['ageMonths', 'breathRatePerMin', 'coughDays', ...SYMPTOM_KEYS] as const;

const ProtocolSchema = z.object({
  version: z.string().min(1),
  source: z.string().min(1),
  outcomeMapping: z.record(z.enum(DECISIONS), z.string()),
  ageRangeMonths: z.object({ min: z.literal(0), maxExclusive: z.number().positive() }),
  youngInfantMaxAgeMonthsExclusive: z.number().positive(),
  fastBreathing: z
    .array(
      z.object({
        minAgeMonths: z.number().min(0),
        maxAgeMonthsExclusive: z.number().positive(),
        ratePerMin: z.number().int().positive(),
        note: z.string(),
      }),
    )
    .min(1),
  coughDaysGreaterThan: z.number().int().positive(),
  screeningActionMap: z.object({
    urgentReferral: z.literal('GO_NOW'),
    clinicTreatmentOrNonUrgentReferral: z.literal('REFER_SOON'),
    homeCare: z.literal('HOME'),
    note: z.string().min(1),
  }),
  limitations: z.array(z.string().min(1)).min(1),
  dangerSigns: z.array(z.enum(SYMPTOM_KEYS)).min(1),
  criticalFields: z.array(z.enum(CRITICAL_FIELD_NAMES)),
  conditionallyCriticalFields: z.array(
    z.object({
      field: z.enum(CRITICAL_FIELD_NAMES),
      when: z.enum(CONDITIONAL_TRIGGERS),
      note: z.string(),
    }),
  ),
  rules: z
    .array(
      z.object({
        id: z.string().min(1),
        when: z.enum(CONDITIONS),
        outcome: z.enum(DECISIONS),
        reasonKey: z.string().min(1),
        source: z.string().min(1),
      }),
    )
    .min(1),
  audio: z
    .object({
      escalationEnabled: z.literal(false),
      note: z.string().min(1),
    })
    .strict(),
});
export type ProtocolConfig = z.infer<typeof ProtocolSchema>;

function findTodo(value: unknown, path: string): string | null {
  if (typeof value === 'string') return /TODO/i.test(value) ? path : null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findTodo(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/TODO/i.test(k)) return `${path}.${k}`;
      const hit = findTodo(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

/** Validates a protocol file and fails loudly on placeholders or an enabled audio rule. */
export function loadProtocol(raw: unknown): ProtocolConfig {
  const todo = findTodo(raw, 'protocol');
  if (todo) {
    throw new Error(`protocol.json still contains a TODO placeholder at ${todo}. Fill it from the official guideline.`);
  }
  if (!raw || typeof raw !== 'object' || (raw as { audio?: { escalationEnabled?: unknown } }).audio?.escalationEnabled !== false) {
    throw new Error('audio.escalationEnabled must be false');
  }
  if ('tauHigh' in (raw as object)) {
    throw new Error('protocol.json must not contain an active tauHigh');
  }
  const parsed = ProtocolSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`protocol.json is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const p = parsed.data;

  const bands = [...p.fastBreathing].sort((a, b) => a.minAgeMonths - b.minAgeMonths);
  if (bands[0].minAgeMonths !== p.ageRangeMonths.min) throw new Error('fastBreathing bands must start at age 0');
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].minAgeMonths !== bands[i - 1].maxAgeMonthsExclusive) {
      throw new Error('fastBreathing bands must be contiguous half-open intervals');
    }
  }
  if (bands[bands.length - 1].maxAgeMonthsExclusive !== p.ageRangeMonths.maxExclusive) {
    throw new Error('fastBreathing bands must end at ageRangeMonths.maxExclusive');
  }
  const ids = new Set<string>();
  for (const r of p.rules) {
    if (ids.has(r.id)) throw new Error(`Duplicate rule id ${r.id}`);
    ids.add(r.id);
  }
  if (!p.rules.some((r) => r.outcome === 'HOME')) throw new Error('protocol needs a HOME fallback rule');
  return p;
}

export const protocol: ProtocolConfig = loadProtocol(rawProtocol);

export function fastBreathingCutoff(ageMonths: number | null, p: ProtocolConfig = protocol): number | null {
  if (ageMonths === null || !Number.isFinite(ageMonths)) return null;
  const band = p.fastBreathing.find((b) => ageMonths >= b.minAgeMonths && ageMonths < b.maxAgeMonthsExclusive);
  return band ? band.ratePerMin : null;
}

function isYoungInfant(age: number | null, p: ProtocolConfig): boolean {
  return age !== null && age >= 0 && age < p.youngInfantMaxAgeMonthsExclusive;
}

function inChildRange(age: number | null, p: ProtocolConfig): boolean {
  return age !== null && age >= p.youngInfantMaxAgeMonthsExclusive && age < p.ageRangeMonths.maxExclusive;
}

function computeMissing(input: CaseInput, p: ProtocolConfig): string[] {
  const s = input.symptoms;
  const value = (field: string): unknown => {
    if (field === 'ageMonths') return input.patient.ageMonths;
    if (field === 'breathRatePerMin') return input.breathRatePerMin;
    return (s as Record<string, unknown>)[field];
  };
  const missing = new Set<string>();
  for (const f of p.criticalFields) if (value(f) === null || value(f) === undefined) missing.add(f);
  for (const c of p.conditionallyCriticalFields) {
    const active =
      c.when === 'COUGH'
        ? s.cough === true
        : c.when === 'COUGH_OR_DIFFICULT_BREATHING'
          ? s.cough === true || s.difficultyBreathing === true
          : isYoungInfant(input.patient.ageMonths, p);
    if (active && (value(c.field) === null || value(c.field) === undefined)) missing.add(c.field);
  }
  return [...missing];
}

function conditionHolds(when: Condition, input: CaseInput, p: ProtocolConfig): boolean {
  const s = input.symptoms;
  const age = input.patient.ageMonths;
  const rate = input.breathRatePerMin;
  const cutoff = fastBreathingCutoff(age, p);
  switch (when) {
    case 'ANY_DANGER_SIGN':
      return p.dangerSigns.some((k) => s[k as BooleanSymptomKey] === true);
    case 'STRIDOR_WHEN_CALM':
      return s.stridorWhenCalm === true && (age === null || (age >= p.youngInfantMaxAgeMonthsExclusive));
    case 'STRIDOR_YOUNG_INFANT':
      return s.stridorWhenCalm === true && isYoungInfant(age, p);
    case 'YOUNG_INFANT_CHEST_INDRAWING':
      return isYoungInfant(age, p) && s.chestIndrawing === true;
    case 'YOUNG_INFANT_FAST_BREATHING':
      return isYoungInfant(age, p) && rate !== null && cutoff !== null && rate >= cutoff;
    case 'YOUNG_INFANT_FEVER':
      return isYoungInfant(age, p) && s.fever === true;
    case 'CHEST_INDRAWING':
      return inChildRange(age, p) && s.chestIndrawing === true;
    case 'FAST_BREATHING':
      return (
        inChildRange(age, p) &&
        (s.cough === true || s.difficultyBreathing === true) &&
        rate !== null &&
        cutoff !== null &&
        rate >= cutoff
      );
    case 'COUGH_MORE_THAN_DAYS':
      return s.cough === true && s.coughDays !== null && s.coughDays > p.coughDaysGreaterThan;
    case 'FEVER_NEEDS_ASSESSMENT':
      return age !== null && !isYoungInfant(age, p) && s.fever === true;
    case 'DIARRHEA_NEEDS_DEHYDRATION_CHECK':
      return s.diarrhea === true;
    case 'AGE_OUTSIDE_RANGE':
      return age !== null && age >= p.ageRangeMonths.maxExclusive;
    case 'NO_CONCERNING_SIGNS':
      return true;
  }
}

/**
 * Pure, rule-based referral decision. audioScore is accepted so callers can pass a
 * recording score through, and it is ignored. It never changes the outcome, the
 * reasons, or needsHumanReview. audioEscalated is always false.
 */
export function evaluate(input: CaseInput, p: ProtocolConfig = protocol, audioScore?: number): DecisionResult {
  void audioScore;
  const missingFields = computeMissing(input, p);
  const matched = p.rules.filter((r) => conditionHolds(r.when, input, p));

  let outcome: Decision = 'HOME';
  for (const r of matched) if (OUTCOME_RANK[r.outcome] > OUTCOME_RANK[outcome]) outcome = r.outcome;

  const winners = matched.filter((r) => r.outcome === outcome);
  let reasonKeys: string[] = [];
  for (const r of winners) {
    if (r.when === 'ANY_DANGER_SIGN') {
      for (const k of p.dangerSigns) if (input.symptoms[k as BooleanSymptomKey] === true) reasonKeys.push(`${r.reasonKey}_${k}`);
    } else {
      reasonKeys.push(r.reasonKey);
    }
  }

  if (missingFields.length > 0 && outcome === 'HOME') {
    outcome = 'REFER_SOON';
    reasonKeys = ['missing_critical_data'];
  }

  const ageOutside = matched.some((r) => r.when === 'AGE_OUTSIDE_RANGE');
  const needsHumanReview = missingFields.length > 0 || ageOutside || input.patient.ageApproximate === true;

  return {
    outcome,
    reasonKeys: [...new Set(reasonKeys)],
    protocolVersion: p.version,
    audioEscalated: false,
    missingFields,
    needsHumanReview,
    matchedRuleIds: matched.map((r) => r.id),
  };
}

export const clinics = rawClinics as import('@aman/types').Clinic[];

export const REASON_KEYS = [
  ...protocol.dangerSigns.map((k) => `danger_sign_${k}`),
  ...protocol.rules.filter((r) => r.when !== 'ANY_DANGER_SIGN').map((r) => r.reasonKey),
  'missing_critical_data',
];
