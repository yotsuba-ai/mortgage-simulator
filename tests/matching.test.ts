import { describe, expect, it } from "vitest";
import { compareMatch, matchCustomerProperty } from "@/lib/matching";
import type { CustomerConditions, PropertyInfo } from "@/lib/types";

const customer = (over: Partial<CustomerConditions> = {}): CustomerConditions => ({
  name: "山田",
  budgetMin: 2500,
  budgetMax: 3500,
  preferredAreas: ["緑町"],
  propertyType: "DETACHED",
  minBedrooms: 3,
  parkingSpaces: 2,
  maxBuildingAge: 15,
  schoolDistrict: "緑小学校",
  ...over,
});

const property = (over: Partial<PropertyInfo> = {}): PropertyInfo => ({
  name: "緑町の戸建",
  price: 3280,
  address: "○○市緑町1-2-3",
  area: "緑町",
  propertyType: "DETACHED",
  bedrooms: 4,
  parkingSpaces: 2,
  buildingAge: 10,
  schoolDistrict: "緑小学校",
  ...over,
});

const status = (r: ReturnType<typeof matchCustomerProperty>, key: string) =>
  r.criteria.find((c) => c.key === key)!;

describe("matchCustomerProperty", () => {
  it("完全一致は100点で全項目MATCH", () => {
    const r = matchCustomerProperty(customer(), property());
    expect(r.total).toBe(100);
    expect(r.evaluatedCount).toBe(7);
    expect(r.criteria.every((c) => c.status === "MATCH")).toBe(true);
    expect(status(r, "price").reason).toContain("3,280万円");
  });

  it("予算オーバー（5%超）は価格MISMATCHで25点減", () => {
    const r = matchCustomerProperty(customer(), property({ price: 4000 }));
    expect(status(r, "price").status).toBe("MISMATCH");
    expect(status(r, "price").score).toBe(0);
    expect(r.total).toBe(75);
    expect(status(r, "price").reason).toContain("超過");
  });

  it("予算を5%以内で超過するとPARTIAL", () => {
    const r = matchCustomerProperty(customer({ budgetMax: 3200 }), property({ price: 3280 }));
    expect(status(r, "price").status).toBe("PARTIAL");
    expect(status(r, "price").score).toBe(13);
  });

  it("予算下限を下回るとPARTIAL", () => {
    const r = matchCustomerProperty(customer(), property({ price: 2000 }));
    expect(status(r, "price").status).toBe("PARTIAL");
  });

  it("エリア不一致はMISMATCH", () => {
    const r = matchCustomerProperty(customer(), property({ area: "桜ヶ丘" }));
    expect(status(r, "area").status).toBe("MISMATCH");
    expect(r.total).toBe(75);
    expect(status(r, "area").reason).toBe("希望：緑町 / 所在地：桜ヶ丘");
  });

  it("エリア部分一致はPARTIAL", () => {
    const r = matchCustomerProperty(customer({ preferredAreas: ["緑町"] }), property({ area: "緑町二丁目" }));
    expect(status(r, "area").status).toBe("PARTIAL");
  });

  it("全角・空白の表記ゆれは一致扱い", () => {
    const r = matchCustomerProperty(customer({ preferredAreas: ["ＡＢＣ町 "] }), property({ area: "abc町" }));
    expect(status(r, "area").status).toBe("MATCH");
  });

  it("複数希望エリアのいずれかに一致すればMATCH", () => {
    const r = matchCustomerProperty(
      customer({ preferredAreas: ["桜ヶ丘", "緑町", "本町"] }),
      property({ area: "本町" }),
    );
    expect(status(r, "area").status).toBe("MATCH");
    expect(status(r, "area").reason).toContain("桜ヶ丘・緑町・本町");
  });

  it("複数希望エリアのどれにも一致しなければMISMATCH", () => {
    const r = matchCustomerProperty(customer({ preferredAreas: ["桜ヶ丘", "本町"] }), property({ area: "緑町" }));
    expect(status(r, "area").status).toBe("MISMATCH");
  });

  it("駐車場不足（1台以上あるが不足）はPARTIAL", () => {
    const r = matchCustomerProperty(customer({ parkingSpaces: 2 }), property({ parkingSpaces: 1 }));
    expect(status(r, "parking").status).toBe("PARTIAL");
    expect(status(r, "parking").reason).toContain("希望2台 / 物件1台");
  });

  it("駐車場なしはMISMATCH", () => {
    const r = matchCustomerProperty(customer({ parkingSpaces: 2 }), property({ parkingSpaces: 0 }));
    expect(status(r, "parking").status).toBe("MISMATCH");
    expect(r.total).toBe(90);
  });

  it("駐車場不要の顧客は物件の台数によらずMATCH", () => {
    const r = matchCustomerProperty(customer({ parkingSpaces: 0 }), property({ parkingSpaces: 0 }));
    expect(status(r, "parking").status).toBe("MATCH");
  });

  it("築年数超過（5年超）はMISMATCH、5年以内はPARTIAL", () => {
    const over = matchCustomerProperty(customer({ maxBuildingAge: 10 }), property({ buildingAge: 20 }));
    expect(status(over, "age").status).toBe("MISMATCH");
    expect(over.total).toBe(95);
    const near = matchCustomerProperty(customer({ maxBuildingAge: 10 }), property({ buildingAge: 13 }));
    expect(status(near, "age").status).toBe("PARTIAL");
  });

  it("間取り1部屋不足はPARTIAL、2部屋以上不足はMISMATCH", () => {
    const one = matchCustomerProperty(customer({ minBedrooms: 3 }), property({ bedrooms: 2 }));
    expect(status(one, "bedrooms").status).toBe("PARTIAL");
    const two = matchCustomerProperty(customer({ minBedrooms: 4 }), property({ bedrooms: 2 }));
    expect(status(two, "bedrooms").status).toBe("MISMATCH");
  });

  it("物件種別不一致はMISMATCH", () => {
    const r = matchCustomerProperty(customer(), property({ propertyType: "APARTMENT" }));
    expect(status(r, "type").status).toBe("MISMATCH");
    expect(status(r, "type").reason).toBe("希望：戸建 / 物件：マンション");
  });

  it("学校区不一致はMISMATCH", () => {
    const r = matchCustomerProperty(customer(), property({ schoolDistrict: "桜小学校" }));
    expect(status(r, "school").status).toBe("MISMATCH");
  });

  it("顧客の条件データ欠損はUNKNOWNになり、分母から除外される", () => {
    const r = matchCustomerProperty(
      customer({ schoolDistrict: null, maxBuildingAge: null, parkingSpaces: null }),
      property(),
    );
    expect(status(r, "school").status).toBe("UNKNOWN");
    expect(status(r, "age").status).toBe("UNKNOWN");
    expect(status(r, "parking").status).toBe("UNKNOWN");
    expect(r.evaluatedCount).toBe(4);
    expect(r.possible).toBe(75);
    expect(r.total).toBe(100); // 残り項目が全て一致なら100点
  });

  it("物件データ欠損はUNKNOWNになり、不一致扱いにしない", () => {
    const r = matchCustomerProperty(customer(), property({ price: null, bedrooms: null, schoolDistrict: null }));
    expect(status(r, "price").status).toBe("UNKNOWN");
    expect(status(r, "bedrooms").status).toBe("UNKNOWN");
    expect(status(r, "school").status).toBe("UNKNOWN");
    expect(r.possible).toBe(50);
    expect(r.total).toBe(100);
  });

  it("UNKNOWNと不一致が混在する場合は判定可能項目のみで換算する", () => {
    // 価格UNKNOWN、エリア不一致、それ以外一致 → (50/75)*100 = 67
    const r = matchCustomerProperty(customer(), property({ price: null, area: "桜ヶ丘" }));
    expect(r.possible).toBe(75);
    expect(r.earned).toBe(50);
    expect(r.total).toBe(67);
  });

  it("全項目が判定不能の場合は0点", () => {
    const r = matchCustomerProperty(
      customer({
        budgetMin: null,
        budgetMax: null,
        preferredAreas: [],
        propertyType: null,
        minBedrooms: null,
        parkingSpaces: null,
        maxBuildingAge: null,
        schoolDistrict: null,
      }),
      property(),
    );
    expect(r.total).toBe(0);
    expect(r.evaluatedCount).toBe(0);
  });

  it("配点の合計は100点", () => {
    const r = matchCustomerProperty(customer(), property());
    expect(r.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("compareMatchはスコア降順・同点は判定項目数が多い方を優先", () => {
    const a = matchCustomerProperty(customer(), property());
    const b = matchCustomerProperty(customer({ schoolDistrict: null }), property());
    expect([b, a].sort(compareMatch)[0]).toBe(a);
    const c = matchCustomerProperty(customer(), property({ price: 4000 }));
    expect([c, a].sort(compareMatch)[0]).toBe(a);
  });
});
