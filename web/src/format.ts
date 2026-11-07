export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function formatPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function formatScore(x: number | null | undefined): string {
  return x == null ? "n/a" : x.toFixed(2);
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}
