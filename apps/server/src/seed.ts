import { randomUUID } from 'node:crypto';
import { evaluate } from '@aman/protocol';
import type { CaseInput, CaseRecord, Lang } from '@aman/types';
import { openDb, saveCase } from './db';
import { loadEnvFile, readConfig } from './env';

loadEnvFile();
const db = openDb(readConfig().databasePath);

const no = {
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
};

const samples: { lang: Lang; source: CaseRecord['source']; at: [number, number]; minsAgo: number; input: CaseInput; summary: string; transcript?: string }[] = [
  { lang: 'ur', source: 'field_app', at: [31.39, 74.1], minsAgo: 12, input: { patient: { ageMonths: 8 }, breathRatePerMin: 56, symptoms: { ...no, cough: true, coughDays: 3 } }, summary: 'Synthetic: 8-month-old, cough 3 days, 56 breaths/min.' },
  { lang: 'am', source: 'field_app', at: [9.9, 39.2], minsAgo: 4, input: { patient: { ageMonths: 30 }, breathRatePerMin: 34, symptoms: { ...no, cough: true, coughDays: 2, convulsions: true } }, summary: 'Synthetic: 30-month-old with convulsions reported.' },
  { lang: 'ur', source: 'voice_note', at: [31.2, 74.4], minsAgo: 20, input: { patient: { ageMonths: 12, ageApproximate: true }, breathRatePerMin: null, symptoms: { ...no, cough: true, coughDays: null, fever: null, chestIndrawing: null, stridorWhenCalm: null } }, summary: 'Synthetic voice note: child about 1 year with cough; several answers unknown.', transcript: 'مصنوعی نمونہ: بچے کو کھانسی ہے۔' },
  { lang: 'en', source: 'field_app', at: [31.6, 74.0], minsAgo: 35, input: { patient: { ageMonths: 24 }, breathRatePerMin: 30, symptoms: { ...no, cough: true, coughDays: 2 } }, summary: 'Synthetic: 24-month-old, cough 2 days, 30 breaths/min, no other signs.' },
];

for (const s of samples) {
  const d = evaluate(s.input);
  const record: CaseRecord = {
    id: randomUUID(),
    createdAt: new Date(Date.now() - s.minsAgo * 60000).toISOString(),
    source: s.source,
    language: s.lang,
    ...s.input,
    decision: { outcome: d.outcome, reasonKeys: d.reasonKeys, protocolVersion: d.protocolVersion, audioEscalated: d.audioEscalated },
    summary: { english: s.summary, ...(s.transcript ? { transcript: s.transcript } : {}) },
    missingFields: d.missingFields,
    needsHumanReview: d.needsHumanReview,
    status: 'new',
    location: { lat: s.at[0], lng: s.at[1] },
  };
  saveCase(db, record);
  console.log(`${record.decision.outcome.padEnd(10)} ${s.summary}`);
}
