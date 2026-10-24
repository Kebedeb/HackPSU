"""Log-mel features that must match packages/audio/src/index.ts.

Uses the same iterative radix-2 FFT as the browser (vectorised across frames) instead of
numpy.fft, so the golden-file parity test can hold to a tight tolerance.
"""
import numpy as np

SAMPLE_RATE = 16000
CLIP_SECONDS = 10
CLIP_SAMPLES = SAMPLE_RATE * CLIP_SECONDS
N_FFT = 512
HOP = 256
N_MELS = 32
F_MIN = 50.0
F_MAX = 8000.0
LOG_EPS = 1e-10


def hann():
    n = np.arange(N_FFT, dtype=np.float64)
    return 0.5 - 0.5 * np.cos((2 * np.pi * n) / N_FFT)


def hz_to_mel(f):
    return 2595 * np.log10(1 + f / 700)


def mel_to_hz(m):
    return 700 * (np.power(10.0, m / 2595) - 1)


def mel_filterbank():
    n_bins = N_FFT // 2 + 1
    m_min, m_max = hz_to_mel(F_MIN), hz_to_mel(F_MAX)
    pts = [mel_to_hz(m_min + ((m_max - m_min) * i) / (N_MELS + 1)) for i in range(N_MELS + 2)]
    bank = np.zeros((N_MELS, n_bins))
    freqs = np.array([(k * SAMPLE_RATE) / N_FFT for k in range(n_bins)])
    for m in range(N_MELS):
        lo, mid, hi = pts[m], pts[m + 1], pts[m + 2]
        rising = (freqs > lo) & (freqs < mid)
        falling = (freqs >= mid) & (freqs < hi)
        bank[m, rising] = (freqs[rising] - lo) / (mid - lo)
        bank[m, falling] = (hi - freqs[falling]) / (hi - mid)
    return bank


def _bit_reverse_order(n):
    order = list(range(n))
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            order[i], order[j] = order[j], order[i]
    return np.array(order)


_ORDER = _bit_reverse_order(N_FFT)


def fft_frames(frames):
    """Radix-2 DIT FFT over the last axis, same butterfly order as the TypeScript version."""
    re = frames[:, _ORDER].astype(np.float64).copy()
    im = np.zeros_like(re)
    n = N_FFT
    length = 2
    while length <= n:
        half = length >> 1
        for k in range(half):
            ang = (-2 * np.pi * k) / length
            wr, wi = np.cos(ang), np.sin(ang)
            a = np.arange(k, n, length)
            b = a + half
            tr = re[:, b] * wr - im[:, b] * wi
            ti = re[:, b] * wi + im[:, b] * wr
            re_a, im_a = re[:, a].copy(), im[:, a].copy()
            re[:, b] = re_a - tr
            im[:, b] = im_a - ti
            re[:, a] = re_a + tr
            im[:, a] = im_a + ti
        length <<= 1
    return re, im


_WINDOW = hann()
_BANK = mel_filterbank()


def log_mel(samples):
    samples = np.asarray(samples, dtype=np.float64)
    if len(samples) < N_FFT:
        return np.zeros((0, N_MELS))
    n_frames = 1 + (len(samples) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = samples[idx] * _WINDOW
    re, im = fft_frames(frames)
    n_bins = N_FFT // 2 + 1
    power = re[:, :n_bins] ** 2 + im[:, :n_bins] ** 2
    return np.log(power @ _BANK.T + LOG_EPS)


def pool(mel):
    if len(mel) == 0:
        return np.zeros(2 * N_MELS)
    mean = mel.mean(axis=0)
    std = np.sqrt(((mel - mean) ** 2).mean(axis=0))
    return np.concatenate([mean, std])


def extract_features(samples):
    return pool(log_mel(samples))


def score(features, head):
    sd = np.where(np.array(head["featureStd"]) > 0, head["featureStd"], 1.0)
    z = head["bias"] + float(np.dot(head["weights"], (features - np.array(head["featureMean"])) / sd))
    return 1 / (1 + np.exp(-z))
