import { describe, expect, it } from "vitest";
import { matchCustomerProperty } from "@/lib/matching";
import { generateProposal } from "@/lib/proposal";
import { summarizeConditions, templateGenerator } from "@/lib/proposal/template";
import type { CustomerConditions, PropertyInfo } from "@/lib/types";

const customer: CustomerConditions = {
  name: "山田",
  budgetMin: null,
  budgetMax: 3500,
  preferredAreas: ["緑町"],
  propertyType: "DETACHED",
  minBedrooms: 3,
  parkingSpaces: 2,
  maxBuildingAge: 15,
  schoolDistrict: null,
};

const property: PropertyInfo = {
  name: "緑町の戸建",
  price: 3280,
  address: "○○市緑町1-2-3",
  area: "緑町",
  propertyType: "DETACHED",
  bedrooms: 3,
  parkingSpaces: 1,
  buildingAge: 10,
  schoolDistrict: null,
};

describe("templateGenerator", () => {
  it("顧客名・条件・価格・一致項目・不一致項目を含む文章を生成する", () => {
    const match = matchCustomerProperty(customer, property);
    const text = templateGenerator.generate({ customer, property, match }) as string;
    expect(text.startsWith("山田様、こんにちは。")).toBe(true);
    expect(text).toContain("「緑町エリア・戸建・3,500万円以内・3部屋以上・駐車2台・築15年以内」");
    expect(text).toContain("価格は3,280万円で、");
    expect(text).toContain("「価格」と「希望エリア」と「間取り」が一致しています。");
    expect(text).toContain("一方で「駐車場」については");
    expect(text).toContain("ご興味ありましたら詳細をお送りします。");
  });

  it("不一致がない場合は懸念の段落を含まない", () => {
    const p = { ...property, parkingSpaces: 2 };
    const match = matchCustomerProperty(customer, p);
    const text = templateGenerator.generate({ customer, property: p, match }) as string;
    expect(text).not.toContain("一方で");
  });

  it("条件が未設定でも破綻しない", () => {
    const c: CustomerConditions = {
      name: "田中",
      budgetMin: null,
      budgetMax: null,
      preferredAreas: [],
      propertyType: null,
      minBedrooms: null,
      parkingSpaces: null,
      maxBuildingAge: null,
      schoolDistrict: null,
    };
    const match = matchCustomerProperty(c, property);
    const text = templateGenerator.generate({ customer: c, property, match }) as string;
    expect(text).toContain("田中様");
    expect(text).toContain("ご希望に合いそうな物件が出ました");
    expect(text).toContain("価格は3,280万円です。");
  });

  it("summarizeConditions は設定済みの条件のみを連結する", () => {
    expect(summarizeConditions({ ...customer, parkingSpaces: 0, maxBuildingAge: null })).toBe(
      "緑町エリア・戸建・3,500万円以内・3部屋以上",
    );
  });

  it("generateProposal はテンプレート実装に委譲する", async () => {
    const match = matchCustomerProperty(customer, property);
    await expect(generateProposal({ customer, property, match })).resolves.toContain("山田様");
  });
});
