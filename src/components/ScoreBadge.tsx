export function scoreColor(total: number): string {
  if (total >= 80) return "bg-green-100 text-green-800 border-green-300";
  if (total >= 60) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (total >= 40) return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-gray-100 text-gray-700 border-gray-300";
}

export function ScoreBadge({ total, size = "md" }: { total: number; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "text-3xl px-4 py-2" : "text-lg px-2.5 py-1";
  return (
    <span className={`inline-flex items-baseline gap-0.5 rounded-md border font-bold tabular-nums ${sizeClass} ${scoreColor(total)}`}>
      {total}
      <span className="text-xs font-normal">点</span>
    </span>
  );
}
