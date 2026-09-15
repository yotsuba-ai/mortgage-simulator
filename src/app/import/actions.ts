"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { decodeCsvBytes, parseCsv } from "@/lib/csv/parse";
import { formatRowError, validateCustomerCsv, validatePropertyCsv } from "@/lib/csv/validate";

export type ImportKind = "customers" | "properties";

export interface ImportState {
  kind: ImportKind | null;
  fileName: string | null;
  totalRows: number;
  /** 全体エラー + 行エラー（日本語） */
  errors: string[];
  /** 登録した件数（成功時） */
  imported: number | null;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function importCsv(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const kind = formData.get("kind") === "properties" ? "properties" : "customers";
  const file = formData.get("file");
  const base: ImportState = { kind, fileName: null, totalRows: 0, errors: [], imported: null };

  if (!(file instanceof File) || file.size === 0) {
    return { ...base, errors: ["CSVファイルを選択してください"] };
  }
  base.fileName = file.name;
  if (file.size > MAX_FILE_BYTES) {
    return { ...base, errors: ["ファイルサイズが大きすぎます（5MBまで）"] };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const parsed = parseCsv(decodeCsvBytes(bytes));

  if (kind === "customers") {
    const r = validateCustomerCsv(parsed);
    const errors = [...r.fileErrors, ...r.rowErrors.map(formatRowError)];
    if (errors.length > 0) return { ...base, totalRows: r.totalRows, errors };
    // 1行でもエラーがあれば登録しない。登録はトランザクションで一括
    await prisma.$transaction(async (tx) => {
      await tx.customer.createMany({ data: r.records });
    });
    revalidatePath("/");
    revalidatePath("/customers");
    return { ...base, totalRows: r.totalRows, imported: r.records.length };
  }

  const r = validatePropertyCsv(parsed);
  const errors = [...r.fileErrors, ...r.rowErrors.map(formatRowError)];
  if (errors.length > 0) return { ...base, totalRows: r.totalRows, errors };
  await prisma.$transaction(async (tx) => {
    await tx.property.createMany({ data: r.records });
  });
  revalidatePath("/");
  revalidatePath("/properties");
  return { ...base, totalRows: r.totalRows, imported: r.records.length };
}
