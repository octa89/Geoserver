import type { FeatureCollection } from 'geojson';

/**
 * Extract all numeric values for `field` from the feature collection,
 * returning them sorted ascending.
 */
export function extractNumericValues(
  geojson: FeatureCollection,
  field: string
): number[] {
  const values: number[] = [];

  for (const feature of geojson.features) {
    const raw = feature.properties?.[field];
    if (raw === null || raw === undefined) continue;
    const n = Number(raw);
    if (isFinite(n)) values.push(n);
  }

  return values.sort((a, b) => a - b);
}

/**
 * Equal-interval classification: divide the data range into n equal-width
 * buckets. Returns n+1 break values (min … max).
 */
export function classifyEqualInterval(values: number[], n: number): number[] {
  if (values.length === 0 || n <= 0) return [];

  const min = values[0];
  const max = values[values.length - 1];
  const step = (max - min) / n;

  const breaks: number[] = [min];
  for (let i = 1; i < n; i++) {
    breaks.push(min + step * i);
  }
  breaks.push(max);

  return breaks;
}

/**
 * Quantile classification: each class contains approximately the same number
 * of observations. Returns n+1 break values.
 */
export function classifyQuantile(values: number[], n: number): number[] {
  if (values.length === 0 || n <= 0) return [];

  const breaks: number[] = [values[0]];
  const len = values.length;

  for (let i = 1; i < n; i++) {
    const idx = Math.round((i / n) * len);
    breaks.push(values[Math.min(idx, len - 1)]);
  }

  breaks.push(values[len - 1]);
  return breaks;
}

/**
 * Fisher-Jenks natural breaks classification using dynamic programming.
 *
 * If data has more than 1000 values, it is evenly sampled down to 1000
 * before classification to keep runtime acceptable.
 *
 * Returns n+1 break values (min … max).
 */
export function classifyJenks(values: number[], n: number): number[] {
  if (values.length === 0 || n <= 0) return [];
  if (n === 1) return [values[0], values[values.length - 1]];

  // Evenly sample to at most 1000 observations
  let data = values;
  if (data.length > 1000) {
    const sampled: number[] = [];
    const step = (data.length - 1) / 999;
    for (let i = 0; i < 1000; i++) {
      sampled.push(data[Math.round(i * step)]);
    }
    data = sampled;
  }

  const len = data.length;
  const numClasses = Math.min(n, len);

  // lowerClassLimits[i][j]: the lower class limit for class j at data[i]
  // varianceCombinations[i][j]: variance for the optimal split ending at i in class j
  // 1-indexed arrays for clarity, size (len+1) x (numClasses+1)
  const lowerClassLimits: number[][] = Array.from({ length: len + 1 }, () =>
    new Array(numClasses + 1).fill(1)
  );
  const varianceCombinations: number[][] = Array.from(
    { length: len + 1 },
    () => new Array(numClasses + 1).fill(Infinity)
  );

  // Base case: one class spanning everything
  for (let i = 1; i <= len; i++) {
    varianceCombinations[i][1] = 0;
    lowerClassLimits[i][1] = 1;
  }

  // Fill the DP table
  for (let k = 2; k <= numClasses; k++) {
    // l is the end of the current segment being evaluated
    for (let l = k; l <= len; l++) {
      let runningSum = 0;
      let runningSumSq = 0;
      let count = 0;
      let bestVariance = Infinity;

      // m iterates backward from l toward k-1, building the current segment
      for (let m = l; m >= k; m--) {
        const val = data[m - 1]; // convert to 0-indexed
        count++;
        runningSum += val;
        runningSumSq += val * val;

        // Variance of the segment [m..l]
        const segVariance =
          count > 1
            ? runningSumSq - (runningSum * runningSum) / count
            : 0;

        // Cost of the previous optimal split ending at m-1 with k-1 classes
        const prevCost = varianceCombinations[m - 1][k - 1];
        const totalCost = segVariance + prevCost;

        if (totalCost < bestVariance) {
          bestVariance = totalCost;
          lowerClassLimits[l][k] = m;
        }
      }

      varianceCombinations[l][k] = bestVariance;
    }
  }

  // Extract break points by tracing back through lowerClassLimits
  const breaks: number[] = new Array(numClasses + 1);
  breaks[numClasses] = data[len - 1]; // max value

  let k = numClasses;
  let countDown = len;
  while (k > 1) {
    const limit = lowerClassLimits[countDown][k];
    breaks[k - 1] = data[limit - 1];
    countDown = limit - 1;
    k--;
  }
  breaks[0] = data[0]; // min value

  return breaks;
}

/**
 * Given a sorted breaks array (length n+1 for n classes), return the
 * 0-based class index that `value` falls into.
 *
 * - Values below breaks[0] map to class 0.
 * - Values above breaks[n] map to class n-1.
 */
export function classifyValue(value: number, breaks: number[]): number {
  if (breaks.length < 2) return 0;

  const numClasses = breaks.length - 1;

  for (let i = 1; i <= numClasses; i++) {
    if (value <= breaks[i]) {
      return i - 1;
    }
  }

  // Value exceeds the last break, place in the final class
  return numClasses - 1;
}
