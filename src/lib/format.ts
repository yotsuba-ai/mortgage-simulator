/** 万円の整数を「3,280万円」形式に */
export function formatManYen(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toLocaleString("ja-JP")}万円`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** <input type="date"> 用の YYYY-MM-DD */
export function toDateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatNumber(v: number | null | undefined, unit = ""): string {
  if (v == null) return "—";
  return `${v.toLocaleString("ja-JP")}${unit}`;
}
