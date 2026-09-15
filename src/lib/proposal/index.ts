import { templateGenerator } from "./template";
import type { ProposalGenerator, ProposalInput } from "./types";

export type { ProposalGenerator, ProposalInput } from "./types";

/**
 * 使用するジェネレータをここで切り替える。
 * 例: 将来 LLM API を使う場合は llmGenerator を実装してここに差し替える。
 */
const generator: ProposalGenerator = templateGenerator;

export async function generateProposal(input: ProposalInput): Promise<string> {
  return generator.generate(input);
}
