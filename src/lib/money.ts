// Rounds to the nearest cent. Plain floating-point addition of many small
// currency amounts can drift by fractions of a cent (binary floating point
// can't represent most decimal amounts exactly) - every aggregate sum shown
// as a balance or report total should be rounded through this before
// display/storage.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
