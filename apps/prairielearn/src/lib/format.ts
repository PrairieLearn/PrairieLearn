export function formatFloat(x: number | null, numDecDigits = 2) {
  if (Number.isFinite(x) && typeof x === 'number') {
    return x.toFixed(numDecDigits);
  } else {
    return '—';
  }
}
