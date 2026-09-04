/**
 * Banded Dynamic Time Warping for the Pronunciation module.
 *
 * Euclidean frame distance, Sakoe-Chiba band constraint so slight speaking
 * speed differences between the reference and the child don't blow up the
 * cost. Pure functions, no I/O.
 */

/** Euclidean distance between two equal-length coefficient vectors. */
function euclidean(a: Float64Array | number[], b: Float64Array | number[]): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum + (a.length !== b.length ? Math.abs(a.length - b.length) : 0));
}

/**
 * DTW alignment distance between two MFCC matrices (frames x coeffs),
 * constrained to a Sakoe-Chiba band of |i - j| <= band.
 * Returns the path-normalized distance (total cost / path length).
 */
export function dtwDistance(
  a: Float64Array[] | number[][],
  b: Float64Array[] | number[][],
  bandRatio = 0.15,
): { distance: number; pathLength: number } {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return { distance: Number.POSITIVE_INFINITY, pathLength: 0 };

  // The band must at least cover the diagonal mismatch from unequal lengths.
  const band = Math.max(Math.ceil(bandRatio * Math.max(n, m)), Math.abs(n - m) + 2);

  const INF = Number.POSITIVE_INFINITY;
  const cost: Float64Array[] = [];
  for (let i = 0; i < n; i++) cost.push(new Float64Array(m).fill(INF));

  cost[0][0] = euclidean(a[0], b[0]);
  for (let i = 0; i < n; i++) {
    const jLow = Math.max(0, i - band);
    const jHigh = Math.min(m - 1, i + band);
    for (let j = jLow; j <= jHigh; j++) {
      if (i === 0 && j === 0) continue;
      const d = euclidean(a[i], b[j]);
      let best = INF;
      if (i > 0) best = Math.min(best, cost[i - 1][j]); // insertion
      if (j > 0) best = Math.min(best, cost[i][j - 1]); // deletion
      if (i > 0 && j > 0) best = Math.min(best, cost[i - 1][j - 1]); // match
      cost[i][j] = d + best;
    }
  }

  // Trace the optimal (banded) path length for normalization.
  let pathLength = 0;
  {
    let i = n - 1;
    let j = m - 1;
    if (cost[i][j] === INF) return { distance: Number.POSITIVE_INFINITY, pathLength: 0 };
    while (i > 0 || j > 0) {
      pathLength++;
      const dDiag = i > 0 && j > 0 ? cost[i - 1][j - 1] : INF;
      const dUp = i > 0 ? cost[i - 1][j] : INF;
      const dLeft = j > 0 ? cost[i][j - 1] : INF;
      const min = Math.min(dDiag, dUp, dLeft);
      if (min === dDiag) { i--; j--; }
      else if (min === dUp) i--;
      else j--;
    }
    pathLength++; // origin cell
  }

  return { distance: cost[n - 1][m - 1] / pathLength, pathLength };
}
