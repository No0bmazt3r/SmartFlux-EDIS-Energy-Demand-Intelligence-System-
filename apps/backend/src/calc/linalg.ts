// Small dense least squares for the machine regression (p ≤ ~20 columns). No dependency needed.

// Solves A x = b by Gaussian elimination with partial pivoting. Returns undefined if A is singular.
export function solve(A: number[][], b: number[]): number[] | undefined {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-9) return undefined;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// Ordinary least squares y ≈ X β with standard errors and R².
export function ols(X: number[][], y: number[]) {
  const n = X.length, p = X[0].length;
  const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((s, row) => s + row[i] * row[j], 0)));
  const Xty = Array.from({ length: p }, (_, i) => X.reduce((s, row, t) => s + row[i] * y[t], 0));
  const beta = solve(XtX, Xty);
  if (!beta) return undefined;
  const fitted = X.map((row) => row.reduce((s, v, i) => s + v * beta[i], 0));
  const rss = y.reduce((s, v, t) => s + (v - fitted[t]) ** 2, 0);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const tss = y.reduce((s, v) => s + (v - mean) ** 2, 0);
  const sigma2 = rss / Math.max(1, n - p);
  const se = Array.from({ length: p }, (_, i) => {
    const e = Array.from({ length: p }, (_, j) => (i === j ? 1 : 0));
    return Math.sqrt(Math.max(0, sigma2 * solve(XtX, e)![i]));
  });
  return { beta, se, r2: tss ? 1 - rss / tss : 0 };
}
