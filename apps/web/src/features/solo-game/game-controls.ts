export function normalizePredictionValue(
  requestedValue: number,
  currentValue: number,
  legalValues: readonly number[],
): number {
  if (legalValues.includes(requestedValue)) {
    return requestedValue;
  }

  const direction = requestedValue < currentValue ? -1 : 1;
  const inDirection = findLegalValue(requestedValue, direction, legalValues);
  if (inDirection !== null) {
    return inDirection;
  }

  return (
    findLegalValue(requestedValue, direction === 1 ? -1 : 1, legalValues) ??
    (legalValues.includes(currentValue) ? currentValue : (legalValues[0] ?? 0))
  );
}

function findLegalValue(
  start: number,
  direction: -1 | 1,
  legalValues: readonly number[],
): number | null {
  for (
    let candidate = start + direction;
    candidate >= 0 && candidate <= 6;
    candidate += direction
  ) {
    if (legalValues.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}
