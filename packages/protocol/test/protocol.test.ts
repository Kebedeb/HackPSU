import { describe, expect, it } from 'vitest';
import rawProtocol from '../protocol.json' with { type: 'json' };
import { evaluate, fastBreathingCutoff, loadProtocol, protocol, REASON_KEYS } from '../src/index';
import { mk, TABLE } from './cases';

describe('protocol table', () => {
  it('has at least 25 synthetic cases', () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(25);
  });

  for (const c of TABLE) {
    it(c.name, () => {
      const r = evaluate(c.input, protocol);
      expect(r.outcome).toBe(c.outcome);
      expect(r.reasonKeys).toEqual(c.reasons);
      if (c.needsHumanReview !== undefined) expect(r.needsHumanReview).toBe(c.needsHumanReview);
      if (c.missing) expect([...r.missingFields].sort()).toEqual([...c.missing].sort());
      for (const k of r.reasonKeys) expect(REASON_KEYS).toContain(k);
    });
  }

  it('every rule in protocol.json is exercised by the table', () => {
    const hit = new Set(TABLE.flatMap((c) => evaluate(c.input).matchedRuleIds));
    for (const r of protocol.rules) expect(hit, r.id).toContain(r.id);
  });
});

describe('audio score does not change the decision', () => {
  it('undefined, 0, and 1 give an identical decision for every case', () => {
    for (const c of TABLE) {
      const base = evaluate(c.input, protocol);
      expect(evaluate(c.input, protocol, undefined)).toEqual(base);
      expect(evaluate(c.input, protocol, 0)).toEqual(base);
      expect(evaluate(c.input, protocol, 1)).toEqual(base);
      expect(base.audioEscalated).toBe(false);
    }
  });

  it('an out-of-range score also leaves outcome, reasons, and review unchanged', () => {
    const input = mk({ s: { cough: true, coughDays: 2 } });
    const base = evaluate(input, protocol);
    for (const score of [Number.NaN, 7, -0.1, Number.POSITIVE_INFINITY]) {
      expect(evaluate(input, protocol, score)).toEqual(base);
    }
    expect(base.outcome).toBe('HOME');
    expect(base.needsHumanReview).toBe(false);
  });
});

describe('protocol loader', () => {
  const clone = () => JSON.parse(JSON.stringify(rawProtocol));

  it('throws unless audio escalation is disabled', () => {
    expect(protocol.audio.escalationEnabled).toBe(false);
    const enabled = clone();
    enabled.audio = { escalationEnabled: true, note: 'no' };
    expect(() => loadProtocol(enabled)).toThrow(/escalationEnabled must be false/);
    const missing = clone();
    delete missing.audio;
    expect(() => loadProtocol(missing)).toThrow(/escalationEnabled must be false/);
  });

  it('throws if an active tauHigh is present', () => {
    const p = clone();
    p.tauHigh = 0.5;
    expect(() => loadProtocol(p)).toThrow(/active tauHigh/);
    expect(protocol).not.toHaveProperty('tauHigh');
  });

  it('rejects a missing audio block', () => {
    const p = clone();
    delete p.audio;
    expect(() => loadProtocol(p)).toThrow();
  });

  it('fails loudly on a TODO placeholder', () => {
    const p = clone();
    p.fastBreathing[1].ratePerMin = 'TODO';
    expect(() => loadProtocol(p)).toThrow(/TODO placeholder/);
  });

  it('rejects gaps between age bands', () => {
    const p = clone();
    p.fastBreathing[1].minAgeMonths = 3;
    expect(() => loadProtocol(p)).toThrow(/contiguous/);
  });

  it('reads cutoffs from protocol.json, half-open bands', () => {
    expect(fastBreathingCutoff(0)).toBe(60);
    expect(fastBreathingCutoff(1.9)).toBe(60);
    expect(fastBreathingCutoff(2)).toBe(50);
    expect(fastBreathingCutoff(11.9)).toBe(50);
    expect(fastBreathingCutoff(12)).toBe(40);
    expect(fastBreathingCutoff(59)).toBe(40);
    expect(fastBreathingCutoff(60)).toBeNull();
    expect(fastBreathingCutoff(null)).toBeNull();
  });
});
