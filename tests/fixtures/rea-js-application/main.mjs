export function roundCents(value) {
  if (!Number.isFinite(value)) throw new TypeError('A finite amount is required.');
  return Math.round(value * 100) / 100;
}
export function formatAmount(value) {
  return roundCents(value).toFixed(2);
}
