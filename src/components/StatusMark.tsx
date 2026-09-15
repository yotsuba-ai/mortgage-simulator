import { STATUS_LABELS, STATUS_MARKS, type MatchStatus } from "@/lib/matching";

const COLORS: Record<MatchStatus, string> = {
  MATCH: "bg-green-100 text-green-800 border-green-300",
  PARTIAL: "bg-yellow-100 text-yellow-800 border-yellow-300",
  MISMATCH: "bg-red-100 text-red-800 border-red-300",
  UNKNOWN: "bg-gray-100 text-gray-600 border-gray-300",
};

export function StatusMark({ status, withLabel = false }: { status: MatchStatus; withLabel?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 rounded border px-1.5 py-0.5 text-sm font-bold leading-none ${COLORS[status]}`}
      title={STATUS_LABELS[status]}
      aria-label={STATUS_LABELS[status]}
    >
      {STATUS_MARKS[status]}
      {withLabel && <span className="text-xs font-medium">{STATUS_LABELS[status]}</span>}
    </span>
  );
}
