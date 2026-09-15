import type { MatchResult } from "../matching";
import type { CustomerConditions, PropertyInfo } from "../types";

/** 提案文生成の入力 */
export interface ProposalInput {
  customer: CustomerConditions;
  property: PropertyInfo;
  match: MatchResult;
}

/**
 * 提案文ジェネレータのインターフェース。
 * MVP はテンプレート実装。将来 LLM API 実装に差し替える場合は
 * この型を満たす実装を用意し、index.ts の generateProposal で切り替える。
 */
export interface ProposalGenerator {
  generate(input: ProposalInput): Promise<string> | string;
}
