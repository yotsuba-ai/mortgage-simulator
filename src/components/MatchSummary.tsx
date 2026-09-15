import type { MatchResult } from "@/lib/matching";
import { StatusMark } from "./StatusMark";

/** 一覧・ランキング用：一致/不一致の項目を1行で要約 */
export function MatchSummary({ match }: { match: MatchResult }) {
  const matched = match.criteria.filter((c) => c.status === "MATCH");
  const partial = match.criteria.filter((c) => c.status === "PARTIAL");
  const mismatched = match.criteria.filter((c) => c.status === "MISMATCH");
  return (
    <div className="flex flex-col gap-1 text-sm">
      {matched.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <StatusMark status="MATCH" />
          <span className="text-gray-800">{matched.map((c) => c.label).join("・")}</span>
        </div>
      )}
      {partial.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <StatusMark status="PARTIAL" />
          <span className="text-gray-800">{partial.map((c) => c.label).join("・")}</span>
        </div>
      )}
      {mismatched.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <StatusMark status="MISMATCH" />
          <span className="text-gray-800">{mismatched.map((c) => c.label).join("・")}</span>
        </div>
      )}
      <div className="text-xs text-gray-500">
        判定できた項目 {match.evaluatedCount}/{match.criteriaCount}
      </div>
    </div>
  );
}
