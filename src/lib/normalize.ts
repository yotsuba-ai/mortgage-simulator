/** 文字列比較用の正規化：全角→半角、trim、小文字化、空白除去 */
export function normalizeText(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 区切り文字（| 、 , ／ /）で分割し、空要素を除く */
export function splitList(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[|,、，/／;；]/)
    .map((x) => x.trim())
    .filter((x) => x !== "");
}
