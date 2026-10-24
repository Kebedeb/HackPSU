/**
 * Log-mel features, an experimental logistic-regression score, and occlusion saliency.
 * Must stay numerically identical to ml/features.py (same FFT, window, mel bank and pooling);
 * the parity test in packages/audio/test enforces this.
 */

export const SAMPLE_RATE = 16000;
export const CLIP_SECONDS = 10;
export const CLIP_SAMPLES = SAMPLE_RATE * CLIP_SECONDS;
export const N_FFT = 512;
export const HOP = 256;
export const N_MELS = 32;
export const F_MIN = 50;
export const F_MAX = 8000;
const LOG_EPS = 1e-10;

export interface HeadWeights {
  modelVersion: string;
  experimental: true;
  usedForReferral: false;
  featureMean: number[];
  featureStd: number[];
  weights: number[];
  bias: number;
}

let windowCache: Float64Array | null = null;
function hann(): Float64Array {
  if (windowCache) return windowCache;
  const w = new Float64Array(N_FFT);
  for (let n = 0; n < N_FFT; n++) w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT);
  return (windowCache = w);
}

const hzToMel = (f: number) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m: number) => 700 * (Math.pow(10, m / 2595) - 1);

let melCache: Float64Array[] | null = null;
export function melFilterbank(): Float64Array[] {
  if (melCache) return melCache;
  const nBins = N_FFT / 2 + 1;
  const mMin = hzToMel(F_MIN);
  const mMax = hzToMel(F_MAX);
  const pts: number[] = [];
  for (let i = 0; i < N_MELS + 2; i++) pts.push(melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1)));
  const bank: Float64Array[] = [];
  for (let m = 0; m < N_MELS; m++) {
    const row = new Float64Array(nBins);
    const lo = pts[m];
    const mid = pts[m + 1];
    const hi = pts[m + 2];
    for (let k = 0; k < nBins; k++) {
      const f = (k * SAMPLE_RATE) / N_FFT;
      if (f > lo && f < mid) row[k] = (f - lo) / (mid - lo);
      else if (f >= mid && f < hi) row[k] = (hi - f) / (hi - mid);
    }
    bank.push(row);
  }
  return (melCache = bank);
}

/** In-place iterative radix-2 FFT (decimation in time). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    for (let k = 0; k < half; k++) {
      const ang = (-2 * Math.PI * k) / len;
      const wr = Math.cos(ang);
      const wi = Math.sin(ang);
      for (let s = 0; s < n; s += len) {
        const a = s + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] = re[a] + tr;
        im[a] = im[a] + ti;
      }
    }
  }
}

/** Log-mel spectrogram, frames x mels. No padding: frames = 1 + floor((len - N_FFT) / HOP). */
export function logMel(samples: ArrayLike<number>): Float64Array[] {
  const w = hann();
  const bank = melFilterbank();
  const nBins = N_FFT / 2 + 1;
  const nFrames = samples.length < N_FFT ? 0 : 1 + Math.floor((samples.length - N_FFT) / HOP);
  const out: Float64Array[] = [];
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const power = new Float64Array(nBins);
  for (let t = 0; t < nFrames; t++) {
    const off = t * HOP;
    for (let n = 0; n < N_FFT; n++) {
      re[n] = samples[off + n] * w[n];
      im[n] = 0;
    }
    fft(re, im);
    for (let k = 0; k < nBins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    const row = new Float64Array(N_MELS);
    for (let m = 0; m < N_MELS; m++) {
      let acc = 0;
      const f = bank[m];
      for (let k = 0; k < nBins; k++) acc += f[k] * power[k];
      row[m] = Math.log(acc + LOG_EPS);
    }
    out.push(row);
  }
  return out;
}

/** Mean then population std of each mel band over time: 2 * N_MELS values. */
export function poolFeatures(mel: Float64Array[]): number[] {
  const n = mel.length;
  const mean = new Array<number>(N_MELS).fill(0);
  const std = new Array<number>(N_MELS).fill(0);
  if (n === 0) return [...mean, ...std];
  for (const row of mel) for (let m = 0; m < N_MELS; m++) mean[m] += row[m];
  for (let m = 0; m < N_MELS; m++) mean[m] /= n;
  for (const row of mel) for (let m = 0; m < N_MELS; m++) std[m] += (row[m] - mean[m]) ** 2;
  for (let m = 0; m < N_MELS; m++) std[m] = Math.sqrt(std[m] / n);
  return [...mean, ...std];
}

export function extractFeatures(samples: ArrayLike<number>): number[] {
  return poolFeatures(logMel(samples));
}

export function scoreFeatures(features: number[], head: HeadWeights): number {
  let z = head.bias;
  for (let i = 0; i < features.length; i++) {
    const sd = head.featureStd[i] > 0 ? head.featureStd[i] : 1;
    z += head.weights[i] * ((features[i] - head.featureMean[i]) / sd);
  }
  return 1 / (1 + Math.exp(-z));
}

export function scoreClip(samples: ArrayLike<number>, head: HeadWeights): number {
  return scoreFeatures(extractFeatures(samples), head);
}

/** Silence each 1-second window in turn and record how much the score drops. */
export function occlusionSaliency(samples: Float32Array | Float64Array, head: HeadWeights): { score: number; saliency: number[] } {
  const score = scoreClip(samples, head);
  const windows = Math.floor(samples.length / SAMPLE_RATE);
  const saliency: number[] = [];
  for (let i = 0; i < windows; i++) {
    const copy = Float64Array.from(samples);
    copy.fill(0, i * SAMPLE_RATE, (i + 1) * SAMPLE_RATE);
    saliency.push(score - scoreClip(copy, head));
  }
  return { score, saliency };
}

export interface ClipQuality {
  ok: boolean;
  problem: 'too_short' | 'mostly_silent' | 'clipped' | null;
  silentFraction: number;
  clippedFraction: number;
}

export function checkClipQuality(samples: ArrayLike<number>): ClipQuality {
  if (samples.length < CLIP_SAMPLES * 0.9) return { ok: false, problem: 'too_short', silentFraction: 1, clippedFraction: 0 };
  const frame = 1600;
  let silent = 0;
  let frames = 0;
  let clipped = 0;
  for (let off = 0; off + frame <= samples.length; off += frame) {
    let acc = 0;
    for (let i = off; i < off + frame; i++) {
      acc += samples[i] * samples[i];
      if (Math.abs(samples[i]) >= 0.99) clipped++;
    }
    if (Math.sqrt(acc / frame) < 0.01) silent++;
    frames++;
  }
  const silentFraction = silent / frames;
  const clippedFraction = clipped / samples.length;
  if (silentFraction > 0.8) return { ok: false, problem: 'mostly_silent', silentFraction, clippedFraction };
  if (clippedFraction > 0.01) return { ok: false, problem: 'clipped', silentFraction, clippedFraction };
  return { ok: true, problem: null, silentFraction, clippedFraction };
}

/** Linear-interpolation resample to 16 kHz mono. */
export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === SAMPLE_RATE) return input;
  const ratio = inputRate / SAMPLE_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Decode a 16-bit PCM mono WAV. */
export function decodeWav16(buf: ArrayBuffer): { rate: number; samples: Float32Array } {
  const dv = new DataView(buf);
  let off = 12;
  let rate = 0;
  let channels = 1;
  while (off + 8 <= dv.byteLength) {
    const id = String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
    const size = dv.getUint32(off + 4, true);
    if (id === 'fmt ') {
      channels = dv.getUint16(off + 10, true);
      rate = dv.getUint32(off + 12, true);
      const bits = dv.getUint16(off + 22, true);
      if (bits !== 16) throw new Error('Only 16-bit PCM WAV is supported');
    } else if (id === 'data') {
      const frames = Math.floor(size / 2 / channels);
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) samples[i] = dv.getInt16(off + 8 + i * 2 * channels, true) / 32768;
      return { rate, samples };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('WAV has no data chunk');
}
