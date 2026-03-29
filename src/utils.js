export function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const hasDecimals = Math.abs(n) < 1000 ? 2 : 0;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: hasDecimals });
}

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function sum(arr) {
  return (arr || []).reduce((acc, x) => acc + Number(x || 0), 0);
}

export function safeCSV(s) {
  const str = String(s ?? "");
  const escaped = str.replaceAll('"', '""');
  return `"${escaped}"`;
}