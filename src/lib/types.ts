// ドメイン共通の型・定数

export const PROPERTY_TYPES = ["DETACHED", "APARTMENT", "LAND"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  DETACHED: "戸建",
  APARTMENT: "マンション",
  LAND: "土地",
};

export const PRIORITIES = ["A", "B", "C", "D"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  A: "A（最優先）",
  B: "B",
  C: "C",
  D: "D（低）",
};

export function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === "string" && (PROPERTY_TYPES as readonly string[]).includes(v);
}

export function isPriority(v: unknown): v is Priority {
  return typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);
}

export function propertyTypeLabel(v: string | null | undefined): string {
  return isPropertyType(v) ? PROPERTY_TYPE_LABELS[v] : "未設定";
}

/** 日本語ラベル（戸建/マンション/土地）や英字コードから PropertyType へ変換 */
export function parsePropertyType(v: string | null | undefined): PropertyType | null | undefined {
  if (v == null) return null;
  const s = v.trim();
  if (s === "") return null;
  const upper = s.toUpperCase();
  if (isPropertyType(upper)) return upper;
  const byLabel = (Object.entries(PROPERTY_TYPE_LABELS) as [PropertyType, string][]).find(
    ([, label]) => label === s || (s === "一戸建て" && label === "戸建") || (s === "一戸建" && label === "戸建"),
  );
  if (byLabel) return byLabel[0];
  return undefined; // 不正値
}

/** マッチング判定に使う顧客条件（DBの Customer から必要な項目のみ） */
export interface CustomerConditions {
  id?: number;
  name: string;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredAreas: string[];
  propertyType: string | null;
  minBedrooms: number | null;
  parkingSpaces: number | null;
  maxBuildingAge: number | null;
  schoolDistrict: string | null;
}

/** マッチング判定に使う物件情報 */
export interface PropertyInfo {
  id?: number;
  name: string;
  price: number | null;
  address: string | null;
  area: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  parkingSpaces: number | null;
  buildingAge: number | null;
  schoolDistrict: string | null;
}

/** DBの preferredAreas（JSON文字列）を配列へ */
export function parseAreas(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  } catch {
    return [];
  }
}

export function stringifyAreas(areas: string[]): string {
  return JSON.stringify(areas.map((a) => a.trim()).filter((a) => a !== ""));
}
