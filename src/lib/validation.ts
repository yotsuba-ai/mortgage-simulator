// フォーム入力（FormData）の検証。zod で型変換と日本語エラーを行う
import { z } from "zod";
import { splitList } from "./normalize";
import { PRIORITIES, PROPERTY_TYPES, stringifyAreas } from "./types";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const optionalInt = (label: string, max = 1_000_000) =>
  z.preprocess(
    emptyToNull,
    z
      .coerce
      .number({ error: `${label}は数値で入力してください` })
      .int({ error: `${label}は整数で入力してください` })
      .min(0, { error: `${label}は0以上で入力してください` })
      .max(max, { error: `${label}が大きすぎます` })
      .nullable(),
  );

const optionalFloat = (label: string) =>
  z.preprocess(
    emptyToNull,
    z.coerce.number({ error: `${label}は数値で入力してください` }).min(0, { error: `${label}は0以上で入力してください` }).nullable(),
  );

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000, { error: "文字数が多すぎます" }).nullable());

const optionalPropertyType = z.preprocess(emptyToNull, z.enum(PROPERTY_TYPES, { error: "物件種別が不正です" }).nullable());

export const customerSchema = z
  .object({
    name: z.string().trim().min(1, { error: "氏名は必須です" }).max(100, { error: "氏名が長すぎます" }),
    budgetMin: optionalInt("予算下限"),
    budgetMax: optionalInt("予算上限"),
    preferredAreas: z.preprocess((v) => (typeof v === "string" ? stringifyAreas(splitList(v)) : "[]"), z.string()),
    propertyType: optionalPropertyType,
    minBedrooms: optionalInt("希望部屋数", 20),
    parkingSpaces: optionalInt("駐車場台数", 20),
    maxBuildingAge: optionalInt("築年数上限", 200),
    schoolDistrict: optionalText,
    notes: optionalText,
    priority: z.enum(PRIORITIES, { error: "優先度が不正です" }),
    lastContactedAt: z.preprocess(
      emptyToNull,
      z.coerce.date({ error: "最終接触日の形式が不正です" }).nullable(),
    ),
  })
  .refine((d) => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax, {
    error: "予算下限が予算上限を上回っています",
    path: ["budgetMax"],
  });

export type CustomerInput = z.infer<typeof customerSchema>;

export const propertySchema = z.object({
  name: z.string().trim().min(1, { error: "物件名は必須です" }).max(200, { error: "物件名が長すぎます" }),
  price: optionalInt("価格"),
  address: optionalText,
  area: optionalText,
  propertyType: optionalPropertyType,
  bedrooms: optionalInt("部屋数", 20),
  parkingSpaces: optionalInt("駐車場台数", 20),
  buildingAge: optionalInt("築年数", 200),
  schoolDistrict: optionalText,
  landArea: optionalFloat("土地面積"),
  buildingArea: optionalFloat("建物面積"),
  notes: optionalText,
});

export type PropertyInput = z.infer<typeof propertySchema>;

export type FieldErrors = Record<string, string>;

/** zod のエラーを { フィールド名: メッセージ } に変換 */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function formDataToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** フォーム用 Server Action の状態 */
export interface FormState {
  errors: FieldErrors;
  values: Record<string, string>;
}

export const initialFormState: FormState = { errors: {}, values: {} };
