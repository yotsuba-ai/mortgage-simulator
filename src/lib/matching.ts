// 顧客 × 物件 のルールベースマッチング（決定論的・純粋関数）

import { normalizeText } from "./normalize";
import { propertyTypeLabel, type CustomerConditions, type PropertyInfo } from "./types";

export type MatchStatus = "MATCH" | "PARTIAL" | "MISMATCH" | "UNKNOWN";

export type CriterionKey = "price" | "area" | "bedrooms" | "parking" | "school" | "age" | "type";

export interface CriterionResult {
  key: CriterionKey;
  label: string;
  weight: number; // 配点
  status: MatchStatus;
  score: number; // 獲得点（UNKNOWN は 0）
  reason: string; // 日本語の判定理由
}

export interface MatchResult {
  /** 100点満点の総合スコア（UNKNOWN項目は分母から除外して換算） */
  total: number;
  /** 判定可能項目での獲得点 */
  earned: number;
  /** 判定可能項目の配点合計 */
  possible: number;
  /** 判定できた項目数 */
  evaluatedCount: number;
  /** 全項目数 */
  criteriaCount: number;
  criteria: CriterionResult[];
}

export const WEIGHTS: Record<CriterionKey, number> = {
  price: 25,
  area: 25,
  bedrooms: 15,
  parking: 10,
  school: 10,
  age: 5,
  type: 10,
};

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  price: "価格",
  area: "希望エリア",
  bedrooms: "間取り",
  parking: "駐車場",
  school: "学校区",
  age: "築年数",
  type: "物件種別",
};

export const STATUS_LABELS: Record<MatchStatus, string> = {
  MATCH: "一致",
  PARTIAL: "ほぼ一致",
  MISMATCH: "不一致",
  UNKNOWN: "判定不能",
};

export const STATUS_MARKS: Record<MatchStatus, string> = {
  MATCH: "○",
  PARTIAL: "△",
  MISMATCH: "×",
  UNKNOWN: "？",
};

/** 価格の許容超過率（希望上限の 5% 以内なら PARTIAL） */
const PRICE_TOLERANCE = 0.05;
/** 築年数の許容超過（上限 +5 年以内なら PARTIAL） */
const AGE_TOLERANCE = 5;

function scoreFor(status: MatchStatus, weight: number): number {
  switch (status) {
    case "MATCH":
      return weight;
    case "PARTIAL":
      return Math.round(weight / 2);
    default:
      return 0;
  }
}

function result(key: CriterionKey, status: MatchStatus, reason: string): CriterionResult {
  const weight = WEIGHTS[key];
  return { key, label: CRITERION_LABELS[key], weight, status, score: scoreFor(status, weight), reason };
}

const yen = (v: number) => `${v.toLocaleString("ja-JP")}万円`;

export function evaluatePrice(c: CustomerConditions, p: PropertyInfo): CriterionResult {
  const key = "price";
  if (p.price == null) return result(key, "UNKNOWN", "物件の価格が未登録です");
  if (c.budgetMax == null && c.budgetMin == null) return result(key, "UNKNOWN", "顧客の予算が未設定です");

  const price = p.price;
  const range =
    c.budgetMin != null && c.budgetMax != null
      ? `${yen(c.budgetMin)}〜${yen(c.budgetMax)}`
      : c.budgetMax != null
        ? `上限${yen(c.budgetMax)}`
        : `下限${yen(c.budgetMin!)}`;

  if (c.budgetMax != null) {
    if (price <= c.budgetMax) {
      if (c.budgetMin != null && price < c.budgetMin) {
        return result(key, "PARTIAL", `希望${range} / 物件${yen(price)}（下限を下回ります）`);
      }
      return result(key, "MATCH", `希望${range} / 物件${yen(price)}`);
    }
    if (price <= Math.round(c.budgetMax * (1 + PRICE_TOLERANCE))) {
      return result(key, "PARTIAL", `希望${range} / 物件${yen(price)}（上限を${yen(price - c.budgetMax)}超過・5%以内）`);
    }
    return result(key, "MISMATCH", `希望${range} / 物件${yen(price)}（上限を${yen(price - c.budgetMax)}超過）`);
  }

  // 下限のみ設定
  if (price >= c.budgetMin!) return result(key, "MATCH", `希望${range} / 物件${yen(price)}`);
  return result(key, "PARTIAL", `希望${range} / 物件${yen(price)}（下限を下回ります）`);
}

export function evaluateArea(c: CustomerConditions, p: PropertyInfo): CriterionResult {
  const key = "area";
  const wanted = c.preferredAreas.map((a) => a.trim()).filter((a) => a !== "");
  if (wanted.length === 0) return result(key, "UNKNOWN", "顧客の希望エリアが未設定です");
  const propertyArea = p.area?.trim() ?? "";
  if (propertyArea === "") return result(key, "UNKNOWN", "物件のエリアが未登録です");

  const target = normalizeText(propertyArea);
  const wantedText = wanted.join("・");

  const exact = wanted.find((a) => normalizeText(a) === target);
  if (exact) return result(key, "MATCH", `希望：${wantedText} / 所在地：${propertyArea}`);

  const partial = wanted.find((a) => {
    const n = normalizeText(a);
    return n !== "" && (target.includes(n) || n.includes(target));
  });
  if (partial) return result(key, "PARTIAL", `希望：${wantedText} / 所在地：${propertyArea}（「${partial}」と部分一致）`);

  return result(key, "MISMATCH", `希望：${wantedText} / 所在地：${propertyArea}`);
}

export function evaluateBedrooms(c: CustomerConditions, p: PropertyInfo): CriterionResult {
  const key = "bedrooms";
  if (c.minBedrooms == null) return result(key, "UNKNOWN", "顧客の希望間取りが未設定です");
  if (p.bedrooms == null) return result(key, "UNKNOWN", "物件の間取りが未登録です");
  const text = `希望${c.minBedrooms}部屋以上 / 物件${p.bedrooms}部屋`;
  if (p.bedrooms >= c.minBedrooms) return result(key, "MATCH", text);
  if (p.bedrooms === c.minBedrooms - 1) return result(key, "PARTIAL", `${text}（1部屋不足）`);
  return result(key, "MISMATCH", `${text}（${c.minBedrooms - p.bedrooms}部屋不足）`);
}

export function evaluateParking(c: CustomerConditions, p: PropertyInfo): CriterionResult {
  const key = "parking";
  if (c.parkingSpaces == null) return result(key, "UNKNOWN", "顧客の駐車場希望が未設定です");
  if (c.parkingSpaces === 0) return result(key, "MATCH", "駐車場は不要");
  if (p.parkingSpaces == null) return result(key, "UNKNOWN", "物件の駐車場台数が未登録です");
  const text = `希望${c.parkingSpaces}台 / 物件${p.parkingSpaces}台`;
  if (p.parkingSpaces >= c.parkingSpaces) return result(key, "MATCH", text);
  if (p.parkingSpaces >= 1) return result(key, "PARTIAL", `${text}（${c.parkingSpaces - p.parkingSpaces}台不足）`);
  return result(key, "MISMATCH", `${text}（駐車場なし）`);
}

export function evaluateSchool(c: CustomerConditions, p: PropertyInfo): CriterionResult {
  const key = "school";
  const wanted = c.schoolDistrict?.trim() ?? "";
  if (wanted === "") return result(key, "UNKNOWN", "顧客の希望学校区が未設定です");
  const actual = p.schoolDistrict?.trim() ?? "";
  if (actual === "") return result(key, "UNKNOWN", "物件の学校区が未登録です");
  const text = `希望：${wanted} / 物件：${actual}`;
  if (normalizeText(wanted) === normalizeText(actual)) return result(key, "MATCH", text);
  return result(key, "MISMATCH", text);
}

export function evaluateAge(c: CustomerConditions, p: PropertyInfo): CriterionResult {
  const key = "age";
  if (c.maxBuildingAge == null) return result(key, "UNKNOWN", "顧客の築年数上限が未設定です");
  if (p.buildingAge == null) return result(key, "UNKNOWN", "物件の築年数が未登録です");
  const text = `希望：築${c.maxBuildingAge}年以内 / 物件：築${p.buildingAge}年`;
  if (p.buildingAge <= c.maxBuildingAge) return result(key, "MATCH", text);
  if (p.buildingAge <= c.maxBuildingAge + AGE_TOLERANCE) {
    return result(key, "PARTIAL", `${text}（${p.buildingAge - c.maxBuildingAge}年超過・5年以内）`);
  }
  return result(key, "MISMATCH", `${text}（${p.buildingAge - c.maxBuildingAge}年超過）`);
}

export function evaluateType(c: CustomerConditions, p: PropertyInfo): CriterionResult {
  const key = "type";
  if (!c.propertyType) return result(key, "UNKNOWN", "顧客の希望物件種別が未設定です");
  if (!p.propertyType) return result(key, "UNKNOWN", "物件の種別が未登録です");
  const text = `希望：${propertyTypeLabel(c.propertyType)} / 物件：${propertyTypeLabel(p.propertyType)}`;
  if (c.propertyType === p.propertyType) return result(key, "MATCH", text);
  return result(key, "MISMATCH", text);
}

/** 顧客 × 物件 のマッチング結果を算出する */
export function matchCustomerProperty(c: CustomerConditions, p: PropertyInfo): MatchResult {
  const criteria: CriterionResult[] = [
    evaluatePrice(c, p),
    evaluateArea(c, p),
    evaluateBedrooms(c, p),
    evaluateParking(c, p),
    evaluateSchool(c, p),
    evaluateAge(c, p),
    evaluateType(c, p),
  ];

  const evaluated = criteria.filter((r) => r.status !== "UNKNOWN");
  const possible = evaluated.reduce((s, r) => s + r.weight, 0);
  const earned = evaluated.reduce((s, r) => s + r.score, 0);
  const total = possible === 0 ? 0 : Math.round((earned / possible) * 100);

  return {
    total,
    earned,
    possible,
    evaluatedCount: evaluated.length,
    criteriaCount: criteria.length,
    criteria,
  };
}

export function byStatus(r: MatchResult, status: MatchStatus): CriterionResult[] {
  return r.criteria.filter((c) => c.status === status);
}

/** ランキング用：スコア降順、同点は判定項目数が多い方を優先 */
export function compareMatch(a: MatchResult, b: MatchResult): number {
  if (b.total !== a.total) return b.total - a.total;
  return b.evaluatedCount - a.evaluatedCount;
}
