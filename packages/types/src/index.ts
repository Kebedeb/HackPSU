import { z } from 'zod';

export const LANGS = ['en', 'ur', 'am'] as const;
export const LangSchema = z.enum(LANGS);
export type Lang = z.infer<typeof LangSchema>;

export const DECISIONS = ['HOME', 'REFER_SOON', 'GO_NOW'] as const;
export const DecisionSchema = z.enum(DECISIONS);
export type Decision = z.infer<typeof DecisionSchema>;

export const CASE_STATUSES = ['new', 'en_route', 'arrived', 'closed'] as const;
export const CaseStatusSchema = z.enum(CASE_STATUSES);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const SYMPTOM_KEYS = [
  'cough',
  'fever',
  'difficultyBreathing',
  'chestIndrawing',
  'stridorWhenCalm',
  'unableToDrinkOrFeed',
  'vomitsEverything',
  'convulsions',
  'unusuallySleepyOrUnconscious',
  'diarrhea',
] as const;
export type BooleanSymptomKey = (typeof SYMPTOM_KEYS)[number];

const triBool = z.boolean().nullable();

export const SymptomsSchema = z.object({
  cough: triBool,
  coughDays: z.number().int().min(0).max(365).nullable(),
  fever: triBool,
  difficultyBreathing: triBool,
  chestIndrawing: triBool,
  stridorWhenCalm: triBool,
  unableToDrinkOrFeed: triBool,
  vomitsEverything: triBool,
  convulsions: triBool,
  unusuallySleepyOrUnconscious: triBool,
  diarrhea: triBool,
});
export type Symptoms = z.infer<typeof SymptomsSchema>;

export const PatientSchema = z.object({
  ageMonths: z.number().min(0).max(240).nullable(),
  ageApproximate: z.boolean().optional(),
});

export const CaseInputSchema = z.object({
  patient: PatientSchema,
  symptoms: SymptomsSchema,
  breathRatePerMin: z.number().min(0).max(200).nullable(),
});
export type CaseInput = z.infer<typeof CaseInputSchema>;

export const AudioInfoSchema = z.object({
  /** Display only. The protocol ignores this number. */
  score: z.number(),
  modelVersion: z.string().max(100),
  saliency: z.array(z.number()).max(60).optional(),
  experimental: z.literal(true).default(true),
});
export type AudioInfo = z.infer<typeof AudioInfoSchema>;

export const DecisionResultSchema = z.object({
  outcome: DecisionSchema,
  reasonKeys: z.array(z.string()),
  protocolVersion: z.string(),
  /** Always false. An audio score never changes the referral decision. */
  audioEscalated: z.literal(false),
  missingFields: z.array(z.string()),
  needsHumanReview: z.boolean(),
  matchedRuleIds: z.array(z.string()),
});
export type DecisionResult = z.infer<typeof DecisionResultSchema>;

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const SummarySchema = z.object({
  english: z.string().max(4000),
  localized: z.string().max(4000).optional(),
  transcript: z.string().max(8000).optional(),
});

export const CaseRecordSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  source: z.enum(['field_app', 'voice_note']),
  language: LangSchema,
  patient: PatientSchema,
  symptoms: SymptomsSchema,
  breathRatePerMin: z.number().min(0).max(200).nullable(),
  audio: AudioInfoSchema.optional(),
  decision: DecisionResultSchema.pick({
    outcome: true,
    reasonKeys: true,
    protocolVersion: true,
    audioEscalated: true,
  }),
  summary: SummarySchema,
  missingFields: z.array(z.string()),
  needsHumanReview: z.boolean(),
  clinicId: z.string().optional(),
  routingNote: z.string().optional(),
  status: CaseStatusSchema,
  location: LocationSchema.optional(),
});
export type CaseRecord = z.infer<typeof CaseRecordSchema>;

/** What a client may submit. The server recomputes the decision and ignores any client one. */
export const CaseSubmissionSchema = CaseRecordSchema.omit({
  decision: true,
  missingFields: true,
  needsHumanReview: true,
  status: true,
  clinicId: true,
  routingNote: true,
}).extend({
  decision: z.unknown().optional(),
  missingFields: z.unknown().optional(),
  needsHumanReview: z.unknown().optional(),
  status: z.unknown().optional(),
});
export type CaseSubmission = z.infer<typeof CaseSubmissionSchema>;

export const CasePatchSchema = z
  .object({
    status: CaseStatusSchema.optional(),
    clinicId: z.string().min(1).max(64).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.clinicId !== undefined, {
    message: 'Provide status or clinicId',
  });

export const ClinicSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  capacityRemaining: z.number().int().min(0),
  languages: z.array(LangSchema),
  region: z.string(),
  synthetic: z.literal(true),
});
export type Clinic = z.infer<typeof ClinicSchema>;

export const OUTCOME_RANK: Record<Decision, number> = { HOME: 0, REFER_SOON: 1, GO_NOW: 2 };

export function emptySymptoms(value: boolean | null = false): Symptoms {
  return {
    cough: value,
    coughDays: null,
    fever: value,
    difficultyBreathing: value,
    chestIndrawing: value,
    stridorWhenCalm: value,
    unableToDrinkOrFeed: value,
    vomitsEverything: value,
    convulsions: value,
    unusuallySleepyOrUnconscious: value,
    diarrhea: value,
  };
}

export type CaseEvent =
  | { type: 'case_upserted'; case: CaseRecord }
  | { type: 'case_updated'; case: CaseRecord };
