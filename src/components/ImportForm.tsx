"use client";

import { useActionState } from "react";
import { importCsv, type ImportKind, type ImportState } from "@/app/import/actions";

const initialImportState: ImportState = { kind: null, fileName: null, totalRows: 0, errors: [], imported: null };

export function ImportForm({ kind, title }: { kind: ImportKind; title: string }) {
  const [state, formAction, pending] = useActionState(importCsv, initialImportState);
  const mine = state.kind === kind;

  return (
    <form action={formAction} className="card space-y-3">
      <h2 className="font-bold">{title}</h2>
      <input type="hidden" name="kind" value={kind} />
      <input type="file" name="file" accept=".csv,text/csv" required className="block w-full text-sm" />
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "検証中…" : "検証して取り込む"}
      </button>

      {mine && state.imported != null && (
        <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          {state.fileName}：{state.imported}件を登録しました。
        </p>
      )}
      {mine && state.errors.length > 0 && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          <p className="mb-1 font-bold">
            エラーがあるため登録していません（{state.errors.length}件）
            {state.totalRows > 0 && <span className="font-normal">・データ行数 {state.totalRows}</span>}
          </p>
          <ul className="max-h-72 list-disc space-y-0.5 overflow-auto pl-5">
            {state.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
