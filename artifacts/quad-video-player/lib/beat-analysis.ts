export type BeatEstimate = {
  bpm: number | null;
  confidence: number;
};

/**
 * Estimates a steady tempo from a 50 Hz RMS energy envelope. The detector is
 * intentionally conservative: silence and short clips return no BPM instead
 * of inventing a tempo.
 */
export function estimateBpm(
  envelope: number[],
  sampleRate = 50,
  minBpm = 50,
  maxBpm = 200,
): BeatEstimate {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || envelope.length < sampleRate * 8) {
    return { bpm: null, confidence: 0 };
  }

  const onset = new Array<number>(envelope.length).fill(0);
  let onsetTotal = 0;
  for (let i = 3; i < envelope.length; i += 1) {
    const baseline = (envelope[i - 1] + envelope[i - 2] + envelope[i - 3]) / 3;
    const value = Math.max(0, envelope[i] - baseline);
    onset[i] = value;
    onsetTotal += value;
  }
  if (onsetTotal <= 1e-7) return { bpm: null, confidence: 0 };

  const scores: Array<{ bpm: number; score: number }> = [];
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 1) {
    const lag = sampleRate * 60 / bpm;
    let dot = 0;
    let leftPower = 0;
    let rightPower = 0;
    for (let i = Math.ceil(lag); i < onset.length; i += 1) {
      const sourceIndex = i - lag;
      const lowerIndex = Math.floor(sourceIndex);
      const fraction = sourceIndex - lowerIndex;
      const right = onset[lowerIndex] * (1 - fraction) + (onset[lowerIndex + 1] ?? 0) * fraction;
      const left = onset[i];
      dot += left * right;
      leftPower += left * left;
      rightPower += right * right;
    }
    scores.push({ bpm, score: dot / Math.sqrt(leftPower * rightPower || 1) });
  }

  const best = scores.reduce((current, candidate) =>
    candidate.score > current.score ? candidate : current, { bpm: 0, score: 0 });
  // A regular pulse train can correlate equally well at half tempo. Prefer
  // the faster grid only when the doubled candidate is nearly as strong.
  const doubled = scores.find((candidate) =>
    candidate.bpm > best.bpm &&
    candidate.bpm / best.bpm >= 1.9 &&
    candidate.bpm / best.bpm <= 2.1 &&
    candidate.score >= best.score * 0.95);
  const bestBpm = doubled?.bpm ?? best.bpm;
  const bestScore = doubled?.score ?? best.score;
  const confidence = Math.max(0, Math.min(1, (bestScore - 0.08) / 0.72));
  return bestScore < 0.12 || !bestBpm
    ? { bpm: null, confidence }
    : { bpm: bestBpm, confidence };
}
