export function roundPoints(points: number): number {
  return Math.round(points * 100) / 100;
}

export function getManualScaleMax({
  maxManualPoints,
  maxPoints,
}: {
  maxManualPoints: number;
  maxPoints: number;
}): number {
  return maxManualPoints > 0 ? maxManualPoints : maxPoints;
}

export function getAutoScaleMax({
  maxAutoPoints,
  maxPoints,
}: {
  maxAutoPoints: number;
  maxPoints: number;
}): number {
  return maxAutoPoints > 0 ? maxAutoPoints : maxPoints;
}

export function pointsToPercentage(points: number, maxPoints: number): number {
  if (maxPoints <= 0) return 0;
  return roundPoints((100 * points) / maxPoints);
}

export function percentageToPoints(percentage: number, maxPoints: number): number {
  if (maxPoints <= 0) return 0;
  return roundPoints((percentage * maxPoints) / 100);
}
