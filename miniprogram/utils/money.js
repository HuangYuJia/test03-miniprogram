export function centsToYuanText(cents) {
  const n = Number(cents ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return (Math.round(n) / 100).toFixed(2);
}

