export function formatFloat(x: number | null, numDecDigits = 2) {
  if (Number.isFinite(x) && typeof x === 'number') {
    return x.toFixed(numDecDigits);
  } else {
    return '—';
  }
}

export function formatPoints(x: number | null, numDecDigits = 2) {
  if (Number.isFinite(x) && typeof x === 'number') {
    return formatFloat(
      Math.floor(x * 10 ** numDecDigits) / 10 ** numDecDigits,
      numDecDigits,
    ).replace(/\.?0+$/, '');
  } else {
    return '—';
  }
}

export function formatPointsOrList(v: number | number[] | null) {
  if (Array.isArray(v)) {
    return v.map((p) => formatPoints(p)).join(', ');
  } else {
    return formatPoints(v);
  }
}
