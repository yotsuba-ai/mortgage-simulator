import Papa from "papaparse";

/** バイト列を文字列へ。UTF-8（BOM可）で読めなければ Shift_JIS として読む */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

export interface ParsedCsv {
  headers: string[];
  /** ヘッダー名 → 値（trim済み）。行番号はファイル上の行（ヘッダー=1行目） */
  rows: { line: number; values: Record<string, string> }[];
  parseErrors: string[];
}

/** CSV文字列をヘッダー付きで解析する。空行は無視する */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const headers = (result.meta.fields ?? []).filter((h) => h !== "");
  const parseErrors = result.errors
    .filter((e) => e.code !== "UndetectableDelimiter")
    .map((e) => `${e.row != null ? `${e.row + 2}行目: ` : ""}${translatePapaError(e.code)}`);

  // 行番号: papaparse はデータ行を 0 始まりで返す。ヘッダーが 1 行目なので +2
  const rows = result.data.map((values, i) => ({ line: i + 2, values }));
  return { headers, rows, parseErrors };
}

function translatePapaError(code: string): string {
  switch (code) {
    case "MissingQuotes":
      return "引用符（\"）が閉じられていません";
    case "TooFewFields":
      return "列数がヘッダーより少ないです";
    case "TooManyFields":
      return "列数がヘッダーより多いです";
    case "InvalidQuotes":
      return "引用符（\"）の使い方が不正です";
    default:
      return `CSVの形式が不正です（${code}）`;
  }
}
