import type { CaseRecord, Clinic } from '@aman/types';

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Kilometres added for a clinic without staff who speak the case language. Small for GO_NOW: distance matters more. */
const LANGUAGE_PENALTY_KM = { GO_NOW: 5, REFER_SOON: 40, HOME: 40 } as const;

export interface RoutingChoice {
  clinic: Clinic;
  distanceKm: number | null;
  note: string;
}

export function pickClinic(c: CaseRecord, clinics: Clinic[]): RoutingChoice | null {
  const open = clinics.filter((k) => k.capacityRemaining > 0);
  if (open.length === 0) return null;
  const penalty = LANGUAGE_PENALTY_KM[c.decision.outcome];

  const scored = open.map((k) => {
    const distanceKm = c.location ? haversineKm(c.location, k) : null;
    const langMatch = k.languages.includes(c.language);
    const score = (distanceKm ?? 0) + (langMatch ? 0 : penalty);
    return { k, distanceKm, langMatch, score };
  });
  scored.sort((a, b) => a.score - b.score || b.k.capacityRemaining - a.k.capacityRemaining);
  const best = scored[0];

  const parts: string[] = [];
  if (best.distanceKm === null) parts.push('No location on the case, so chosen by language match and capacity');
  else parts.push(`Nearest clinic with capacity (${best.distanceKm.toFixed(1)} km)`);
  parts.push(best.langMatch ? `staff speak ${c.language}` : `no ${c.language}-speaking clinic was closer; interpreter may be needed`);
  if (c.decision.outcome === 'GO_NOW') parts.push('GO_NOW: distance weighted over language');
  parts.push(`${best.k.capacityRemaining - 1} places left after this case`);

  return { clinic: best.k, distanceKm: best.distanceKm, note: parts.join('; ') + '.' };
}
