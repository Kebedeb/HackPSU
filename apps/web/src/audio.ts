import {
  CLIP_SAMPLES,
  checkClipQuality,
  decodeWav16,
  logMel,
  occlusionSaliency,
  resampleTo16k,
  SAMPLE_RATE,
  type ClipQuality,
  type HeadWeights,
} from '@aman/audio';

let headPromise: Promise<HeadWeights> | null = null;
export function loadHead(): Promise<HeadWeights> {
  headPromise ??= fetch('/models/head.json').then((r) => {
    if (!r.ok) throw new Error('model file missing');
    return r.json();
  });
  return headPromise;
}

/** Records raw PCM through an AudioWorklet and returns 10 s of 16 kHz mono audio. */
export async function recordClip(onProgress: (fraction: number) => void): Promise<Float32Array> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  try {
    await ctx.audioWorklet.addModule('/worklets/pcm-recorder.js');
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'pcm-recorder');
    const chunks: Float32Array[] = [];
    let total = 0;
    const needed = Math.ceil((CLIP_SAMPLES / SAMPLE_RATE) * ctx.sampleRate);
    await new Promise<void>((resolve) => {
      node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        chunks.push(e.data);
        total += e.data.length;
        onProgress(Math.min(1, total / needed));
        if (total >= needed) resolve();
      };
      src.connect(node);
    });
    src.disconnect();
    node.disconnect();
    const raw = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      raw.set(c, off);
      off += c.length;
    }
    return resampleTo16k(raw, ctx.sampleRate).slice(0, CLIP_SAMPLES);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
  }
}

export async function loadDemoClip(): Promise<Float32Array> {
  const buf = await (await fetch('/audio/samples/synthetic-demo-cough.wav')).arrayBuffer();
  const { rate, samples } = decodeWav16(buf);
  return resampleTo16k(samples, rate).slice(0, CLIP_SAMPLES);
}

export interface ClipAnalysis {
  quality: ClipQuality;
  score?: number;
  saliency?: number[];
  spectrogram?: Float64Array[];
  modelVersion?: string;
}

export async function analyseClip(samples: Float32Array): Promise<ClipAnalysis> {
  const quality = checkClipQuality(samples);
  if (!quality.ok) return { quality };
  const head = await loadHead();
  const { score, saliency } = occlusionSaliency(samples, head);
  return { quality, score, saliency, spectrogram: logMel(samples), modelVersion: head.modelVersion };
}
