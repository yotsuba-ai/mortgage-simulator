import { formatManYen } from "../format";
import { propertyTypeLabel } from "../types";
import type { ProposalGenerator, ProposalInput } from "./types";

/** 顧客の希望条件を「○○エリア・駐車2台・3LDK以上」形式に要約 */
export function summarizeConditions(c: ProposalInput["customer"]): string {
  const parts: string[] = [];
  if (c.preferredAreas.length > 0) parts.push(`${c.preferredAreas.join("・")}エリア`);
  if (c.propertyType) parts.push(propertyTypeLabel(c.propertyType));
  if (c.budgetMax != null) parts.push(`${formatManYen(c.budgetMax)}以内`);
  if (c.minBedrooms != null) parts.push(`${c.minBedrooms}部屋以上`);
  if (c.parkingSpaces != null && c.parkingSpaces > 0) parts.push(`駐車${c.parkingSpaces}台`);
  if (c.schoolDistrict) parts.push(`${c.schoolDistrict}学区`);
  if (c.maxBuildingAge != null) parts.push(`築${c.maxBuildingAge}年以内`);
  return parts.join("・");
}

function joinWithQuotes(items: string[]): string {
  return items.map((s) => `「${s}」`).join("と");
}

/** ルールベースのテンプレート生成（外部APIなしで動作） */
export const templateGenerator: ProposalGenerator = {
  generate({ customer, property, match }: ProposalInput): string {
    const matched = match.criteria.filter((c) => c.status === "MATCH");
    const partial = match.criteria.filter((c) => c.status === "PARTIAL");
    const mismatched = match.criteria.filter((c) => c.status === "MISMATCH");
    const conditions = summarizeConditions(customer);

    const lines: string[] = [];
    lines.push(`${customer.name}様、こんにちは。`);
    lines.push("");

    if (conditions) {
      lines.push("以前お聞きしていた");
      lines.push(`「${conditions}」`);
      lines.push("という条件に近い物件が出ました。");
    } else {
      lines.push("ご希望に合いそうな物件が出ましたのでご案内いたします。");
    }
    lines.push("");

    const priceText = property.price != null ? `価格は${formatManYen(property.price)}で、` : "";
    const matchedLabels = matched.map((c) => c.label);
    if (matchedLabels.length > 0) {
      const head = priceText || "この物件は";
      lines.push(head);
      lines.push(`特に${customer.name}様の希望条件である`);
      lines.push(`${joinWithQuotes(matchedLabels.slice(0, 3))}が一致しています。`);
    } else if (priceText) {
      lines.push(`価格は${formatManYen(property.price)}です。`);
    }
    lines.push("");

    const concerns = [...mismatched, ...partial];
    if (concerns.length > 0) {
      lines.push(`一方で${joinWithQuotes(concerns.map((c) => c.label))}については`);
      lines.push("ご希望と少し異なるため、");
      lines.push("その点も含めてご検討いただければと思います。");
      lines.push("");
    }

    lines.push(`【物件】${property.name}`);
    if (property.address) lines.push(`所在地：${property.address}`);
    lines.push("");
    lines.push("ご興味ありましたら詳細をお送りします。");

    return lines.join("\n");
  },
};
