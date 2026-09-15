import { describe, expect, it } from "vitest";
import { decodeCsvBytes, parseCsv } from "@/lib/csv/parse";
import { formatRowError, validateCustomerCsv, validatePropertyCsv } from "@/lib/csv/validate";

const customerHeader =
  "name,budgetMin,budgetMax,preferredAreas,propertyType,minBedrooms,parkingSpaces,maxBuildingAge,schoolDistrict,priority,lastContactedAt,notes";

describe("parseCsv / decodeCsvBytes", () => {
  it("UTF-8 BOM付きを読める", () => {
    const bytes = new TextEncoder().encode("﻿name,price\nテスト,3000\n");
    const parsed = parseCsv(decodeCsvBytes(bytes));
    expect(parsed.headers).toEqual(["name", "price"]);
    expect(parsed.rows[0].values.name).toBe("テスト");
    expect(parsed.rows[0].line).toBe(2);
  });

  it("Shift_JIS を自動判定して読める", () => {
    // "名前" を Shift_JIS でエンコードしたバイト列
    const sjis = new Uint8Array([0x96, 0xbc, 0x91, 0x4f, 0x2c, 0x70, 0x72, 0x69, 0x63, 0x65, 0x0a, 0x41, 0x2c, 0x31, 0x0a]);
    const text = decodeCsvBytes(sjis);
    expect(text.startsWith("名前,price")).toBe(true);
  });

  it("引用符内のカンマ・改行を扱える", () => {
    const parsed = parseCsv('name,notes\n"山田","南向き, 角地\n要連絡"\n');
    expect(parsed.rows[0].values.notes).toBe("南向き, 角地\n要連絡");
  });
});

describe("validateCustomerCsv", () => {
  it("正常な行を変換する", () => {
    const csv = `${customerHeader}\n山田太郎,2500,3500,緑町|桜ヶ丘,戸建,3,2,15,緑小学校,A,2026-09-01,子供2人\n`;
    const r = validateCustomerCsv(parseCsv(csv));
    expect(r.fileErrors).toEqual([]);
    expect(r.rowErrors).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({
      name: "山田太郎",
      budgetMin: 2500,
      budgetMax: 3500,
      preferredAreas: JSON.stringify(["緑町", "桜ヶ丘"]),
      propertyType: "DETACHED",
      minBedrooms: 3,
      parkingSpaces: 2,
      maxBuildingAge: 15,
      schoolDistrict: "緑小学校",
      priority: "A",
      notes: "子供2人",
    });
    expect(r.records[0].lastContactedAt?.getFullYear()).toBe(2026);
  });

  it("必須列がなければファイルエラー", () => {
    const r = validateCustomerCsv(parseCsv("budgetMax,priority\n3000,A\n"));
    expect(r.fileErrors[0]).toContain("必須列「name」");
    expect(r.records).toHaveLength(0);
  });

  it("不正値は行番号・列名付きの日本語エラーになり、その行は登録対象外", () => {
    const csv = `${customerHeader}\n` +
      `山田,2500,abc,緑町,戸建,3,2,15,,A,2026-09-01,\n` +
      `,2500,3500,緑町,戸建,3,2,15,,A,,\n` +
      `佐藤,2500,3500,緑町,ビル,3,2,15,,Z,2026-13-40,\n` +
      `田中,4000,3500,緑町,戸建,3,2,15,,B,,\n` +
      `鈴木,2500,3500,緑町,マンション,3,1,10,,C,2026/09/01,OK\n`;
    const r = validateCustomerCsv(parseCsv(csv));
    expect(r.fileErrors).toEqual([]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0].name).toBe("鈴木");
    const messages = r.rowErrors.map(formatRowError);
    expect(messages).toContain("2行目（budgetMax）: 予算上限「abc」は整数で入力してください");
    expect(messages).toContain("3行目（name）: 氏名は必須です");
    expect(messages.some((m) => m.startsWith("4行目（propertyType）") && m.includes("ビル"))).toBe(true);
    expect(messages.some((m) => m.startsWith("4行目（priority）") && m.includes("Z"))).toBe(true);
    expect(messages.some((m) => m.startsWith("4行目（lastContactedAt）"))).toBe(true);
    expect(messages).toContain("5行目（budgetMax）: 予算下限（4000）が予算上限（3500）を上回っています");
  });

  it("日本語ヘッダー・全角数字・単位付きも受け付ける", () => {
    const csv = "氏名,予算上限,希望エリア,物件種別,駐車場台数\n山田,３５００万円,緑町、桜ヶ丘,マンション,２台\n";
    const r = validateCustomerCsv(parseCsv(csv));
    expect(r.rowErrors).toEqual([]);
    expect(r.records[0]).toMatchObject({ budgetMax: 3500, propertyType: "APARTMENT", parkingSpaces: 2 });
    expect(r.records[0].preferredAreas).toBe(JSON.stringify(["緑町", "桜ヶ丘"]));
  });

  it("データ行がない場合はエラー", () => {
    const r = validateCustomerCsv(parseCsv(`${customerHeader}\n`));
    expect(r.fileErrors).toContain("データ行がありません");
  });
});

describe("validatePropertyCsv", () => {
  const header = "name,price,address,area,propertyType,bedrooms,parkingSpaces,buildingAge,schoolDistrict,landArea,buildingArea,notes";

  it("正常な行を変換する", () => {
    const r = validatePropertyCsv(parseCsv(`${header}\n緑町の戸建,3280,○○市緑町1-2-3,緑町,戸建,4,2,10,緑小学校,150.5,98.2,南向き\n`));
    expect(r.rowErrors).toEqual([]);
    expect(r.records[0]).toMatchObject({ name: "緑町の戸建", price: 3280, landArea: 150.5, buildingArea: 98.2, propertyType: "DETACHED" });
  });

  it("負の価格・不正な面積はエラー", () => {
    const r = validatePropertyCsv(parseCsv(`${header}\nA,-100,,,,,,,,abc,,\n`));
    const messages = r.rowErrors.map(formatRowError);
    expect(messages).toContain("2行目（price）: 価格「-100」は0以上で入力してください");
    expect(messages).toContain("2行目（landArea）: 土地面積「abc」は0以上の数値で入力してください");
    expect(r.records).toHaveLength(0);
  });

  it("空欄は null（UNKNOWN扱い）として取り込む", () => {
    const r = validatePropertyCsv(parseCsv(`${header}\n土地のみ,,,,土地,,,,,,,\n`));
    expect(r.rowErrors).toEqual([]);
    expect(r.records[0]).toMatchObject({ price: null, bedrooms: null, propertyType: "LAND" });
  });
});
