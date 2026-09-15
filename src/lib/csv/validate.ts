import { splitList } from "../normalize";
import { PRIORITIES, PROPERTY_TYPE_LABELS, isPriority, parsePropertyType, stringifyAreas } from "../types";
import type { ParsedCsv } from "./parse";

export interface CsvRowError {
  line: number; // ファイル上の行番号（ヘッダー=1）
  column: string;
  message: string;
}

export interface CsvValidationResult<T> {
  /** 全行が正常な場合のみ登録に使う */
  records: T[];
  /** 列不足などファイル全体の問題 */
  fileErrors: string[];
  rowErrors: CsvRowError[];
  totalRows: number;
}

export interface CustomerCsvRecord {
  name: string;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredAreas: string; // JSON
  propertyType: string | null;
  minBedrooms: number | null;
  parkingSpaces: number | null;
  maxBuildingAge: number | null;
  schoolDistrict: string | null;
  priority: string;
  lastContactedAt: Date | null;
  notes: string | null;
}

export interface PropertyCsvRecord {
  name: string;
  price: number | null;
  address: string | null;
  area: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  parkingSpaces: number | null;
  buildingAge: number | null;
  schoolDistrict: string | null;
  landArea: number | null;
  buildingArea: number | null;
  notes: string | null;
}

/** 列定義：英字ヘッダーと日本語ヘッダーの両方を受け付ける */
export const CUSTOMER_COLUMNS: { key: keyof CustomerCsvRecord; aliases: string[]; required: boolean; label: string }[] = [
  { key: "name", aliases: ["name", "氏名", "顧客名", "名前"], required: true, label: "氏名" },
  { key: "budgetMin", aliases: ["budgetMin", "予算下限"], required: false, label: "予算下限（万円）" },
  { key: "budgetMax", aliases: ["budgetMax", "予算上限"], required: false, label: "予算上限（万円）" },
  { key: "preferredAreas", aliases: ["preferredAreas", "希望エリア"], required: false, label: "希望エリア（|区切り）" },
  { key: "propertyType", aliases: ["propertyType", "物件種別"], required: false, label: "物件種別" },
  { key: "minBedrooms", aliases: ["minBedrooms", "希望部屋数"], required: false, label: "希望部屋数" },
  { key: "parkingSpaces", aliases: ["parkingSpaces", "駐車場台数"], required: false, label: "駐車場台数" },
  { key: "maxBuildingAge", aliases: ["maxBuildingAge", "築年数上限"], required: false, label: "築年数上限" },
  { key: "schoolDistrict", aliases: ["schoolDistrict", "学校区"], required: false, label: "学校区" },
  { key: "priority", aliases: ["priority", "優先度"], required: false, label: "優先度" },
  { key: "lastContactedAt", aliases: ["lastContactedAt", "最終接触日"], required: false, label: "最終接触日" },
  { key: "notes", aliases: ["notes", "メモ", "備考"], required: false, label: "メモ" },
];

export const PROPERTY_COLUMNS: { key: keyof PropertyCsvRecord; aliases: string[]; required: boolean; label: string }[] = [
  { key: "name", aliases: ["name", "物件名", "名称"], required: true, label: "物件名" },
  { key: "price", aliases: ["price", "価格"], required: false, label: "価格（万円）" },
  { key: "address", aliases: ["address", "住所", "所在地"], required: false, label: "住所" },
  { key: "area", aliases: ["area", "エリア"], required: false, label: "エリア" },
  { key: "propertyType", aliases: ["propertyType", "物件種別"], required: false, label: "物件種別" },
  { key: "bedrooms", aliases: ["bedrooms", "部屋数"], required: false, label: "部屋数" },
  { key: "parkingSpaces", aliases: ["parkingSpaces", "駐車場台数"], required: false, label: "駐車場台数" },
  { key: "buildingAge", aliases: ["buildingAge", "築年数"], required: false, label: "築年数" },
  { key: "schoolDistrict", aliases: ["schoolDistrict", "学校区"], required: false, label: "学校区" },
  { key: "landArea", aliases: ["landArea", "土地面積"], required: false, label: "土地面積（㎡）" },
  { key: "buildingArea", aliases: ["buildingArea", "建物面積"], required: false, label: "建物面積（㎡）" },
  { key: "notes", aliases: ["notes", "メモ", "備考"], required: false, label: "メモ" },
];

type ColumnDef = { key: string; aliases: string[]; required: boolean; label: string };

/** ヘッダーを列定義に対応付ける。戻り値: key → 実際のヘッダー名 */
function mapHeaders(headers: string[], columns: ColumnDef[]): { map: Record<string, string>; errors: string[] } {
  const map: Record<string, string> = {};
  const errors: string[] = [];
  const normalized = headers.map((h) => h.trim());
  for (const col of columns) {
    const found = col.aliases.find((a) => normalized.some((h) => h.toLowerCase() === a.toLowerCase()));
    if (found) {
      map[col.key] = normalized.find((h) => h.toLowerCase() === found.toLowerCase())!;
    } else if (col.required) {
      errors.push(`必須列「${col.aliases[0]}」（${col.label}）がありません`);
    }
  }
  return { map, errors };
}

const isBlank = (v: string | undefined): boolean => v == null || v.trim() === "";

/** 全角数字・カンマ・単位付きの数値文字列を整数へ */
function toInt(raw: string): number | null {
  const s = raw.normalize("NFKC").replace(/[,，]/g, "").replace(/(万円|円|台|年|部屋|LDK|DK|K)$/i, "").trim();
  if (!/^-?\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

function toFloat(raw: string): number | null {
  const s = raw.normalize("NFKC").replace(/[,，]/g, "").replace(/(㎡|m2|m²)$/i, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number.parseFloat(s);
}

function toDate(raw: string): Date | null {
  const s = raw.normalize("NFKC").trim().replace(/[年月]/g, "/").replace(/日$/, "").replace(/-/g, "/");
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

class RowValidator {
  errors: CsvRowError[] = [];
  constructor(
    private line: number,
    private values: Record<string, string>,
    private map: Record<string, string>,
  ) {}

  raw(key: string): string | undefined {
    const header = this.map[key];
    return header ? this.values[header] : undefined;
  }

  private fail(key: string, message: string) {
    this.errors.push({ line: this.line, column: this.map[key] ?? key, message });
  }

  text(key: string): string | null {
    const v = this.raw(key);
    return isBlank(v) ? null : v!.trim();
  }

  requiredText(key: string, label: string): string {
    const v = this.text(key);
    if (v == null) {
      this.fail(key, `${label}は必須です`);
      return "";
    }
    return v;
  }

  int(key: string, label: string, opts: { min?: number; max?: number } = {}): number | null {
    const v = this.raw(key);
    if (isBlank(v)) return null;
    const n = toInt(v!);
    if (n == null) {
      this.fail(key, `${label}「${v}」は整数で入力してください`);
      return null;
    }
    if (opts.min != null && n < opts.min) {
      this.fail(key, `${label}「${v}」は${opts.min}以上で入力してください`);
      return null;
    }
    if (opts.max != null && n > opts.max) {
      this.fail(key, `${label}「${v}」は${opts.max}以下で入力してください`);
      return null;
    }
    return n;
  }

  float(key: string, label: string): number | null {
    const v = this.raw(key);
    if (isBlank(v)) return null;
    const n = toFloat(v!);
    if (n == null || n < 0) {
      this.fail(key, `${label}「${v}」は0以上の数値で入力してください`);
      return null;
    }
    return n;
  }

  propertyType(key: string): string | null {
    const v = this.raw(key);
    if (isBlank(v)) return null;
    const t = parsePropertyType(v);
    if (t === undefined) {
      this.fail(key, `物件種別「${v}」は ${Object.values(PROPERTY_TYPE_LABELS).join("・")} のいずれかで入力してください`);
      return null;
    }
    return t;
  }

  priority(key: string): string {
    const v = this.raw(key);
    if (isBlank(v)) return "B";
    const p = v!.trim().toUpperCase();
    if (!isPriority(p)) {
      this.fail(key, `優先度「${v}」は ${PRIORITIES.join("・")} のいずれかで入力してください`);
      return "B";
    }
    return p;
  }

  date(key: string, label: string): Date | null {
    const v = this.raw(key);
    if (isBlank(v)) return null;
    const d = toDate(v!);
    if (!d) {
      this.fail(key, `${label}「${v}」は YYYY-MM-DD 形式で入力してください`);
      return null;
    }
    return d;
  }
}

export function validateCustomerCsv(parsed: ParsedCsv): CsvValidationResult<CustomerCsvRecord> {
  const { map, errors: fileErrors } = mapHeaders(parsed.headers, CUSTOMER_COLUMNS);
  fileErrors.push(...parsed.parseErrors);
  const records: CustomerCsvRecord[] = [];
  const rowErrors: CsvRowError[] = [];
  if (fileErrors.length > 0) return { records, fileErrors, rowErrors, totalRows: parsed.rows.length };

  for (const { line, values } of parsed.rows) {
    const v = new RowValidator(line, values, map);
    const budgetMin = v.int("budgetMin", "予算下限", { min: 0 });
    const budgetMax = v.int("budgetMax", "予算上限", { min: 0 });
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      v.errors.push({ line, column: map.budgetMax ?? "budgetMax", message: `予算下限（${budgetMin}）が予算上限（${budgetMax}）を上回っています` });
    }
    const record: CustomerCsvRecord = {
      name: v.requiredText("name", "氏名"),
      budgetMin,
      budgetMax,
      preferredAreas: stringifyAreas(splitList(v.text("preferredAreas"))),
      propertyType: v.propertyType("propertyType"),
      minBedrooms: v.int("minBedrooms", "希望部屋数", { min: 0, max: 20 }),
      parkingSpaces: v.int("parkingSpaces", "駐車場台数", { min: 0, max: 20 }),
      maxBuildingAge: v.int("maxBuildingAge", "築年数上限", { min: 0, max: 200 }),
      schoolDistrict: v.text("schoolDistrict"),
      priority: v.priority("priority"),
      lastContactedAt: v.date("lastContactedAt", "最終接触日"),
      notes: v.text("notes"),
    };
    if (v.errors.length > 0) rowErrors.push(...v.errors);
    else records.push(record);
  }

  if (parsed.rows.length === 0) fileErrors.push("データ行がありません");
  return { records, fileErrors, rowErrors, totalRows: parsed.rows.length };
}

export function validatePropertyCsv(parsed: ParsedCsv): CsvValidationResult<PropertyCsvRecord> {
  const { map, errors: fileErrors } = mapHeaders(parsed.headers, PROPERTY_COLUMNS);
  fileErrors.push(...parsed.parseErrors);
  const records: PropertyCsvRecord[] = [];
  const rowErrors: CsvRowError[] = [];
  if (fileErrors.length > 0) return { records, fileErrors, rowErrors, totalRows: parsed.rows.length };

  for (const { line, values } of parsed.rows) {
    const v = new RowValidator(line, values, map);
    const record: PropertyCsvRecord = {
      name: v.requiredText("name", "物件名"),
      price: v.int("price", "価格", { min: 0 }),
      address: v.text("address"),
      area: v.text("area"),
      propertyType: v.propertyType("propertyType"),
      bedrooms: v.int("bedrooms", "部屋数", { min: 0, max: 20 }),
      parkingSpaces: v.int("parkingSpaces", "駐車場台数", { min: 0, max: 20 }),
      buildingAge: v.int("buildingAge", "築年数", { min: 0, max: 200 }),
      schoolDistrict: v.text("schoolDistrict"),
      landArea: v.float("landArea", "土地面積"),
      buildingArea: v.float("buildingArea", "建物面積"),
      notes: v.text("notes"),
    };
    if (v.errors.length > 0) rowErrors.push(...v.errors);
    else records.push(record);
  }

  if (parsed.rows.length === 0) fileErrors.push("データ行がありません");
  return { records, fileErrors, rowErrors, totalRows: parsed.rows.length };
}

export function formatRowError(e: CsvRowError): string {
  return `${e.line}行目（${e.column}）: ${e.message}`;
}
