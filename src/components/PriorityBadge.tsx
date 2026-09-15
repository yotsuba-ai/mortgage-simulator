const COLORS: Record<string, string> = {
  A: "bg-red-600 text-white",
  B: "bg-blue-600 text-white",
  C: "bg-gray-500 text-white",
  D: "bg-gray-300 text-gray-800",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded text-sm font-bold ${COLORS[priority] ?? COLORS.C}`} title={`優先度${priority}`}>
      {priority}
    </span>
  );
}
