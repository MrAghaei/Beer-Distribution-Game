// Costs move in steps of 0.5, so one decimal is enough.
const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function gameUrl(code: string): string {
  return `${window.location.origin}/game/${code}`;
}
