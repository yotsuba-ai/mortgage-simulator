"use client";

import { useActionState } from "react";
import { saveMatchNote, type MemoState } from "@/app/match/actions";

export function MemoForm({ customerId, propertyId, memo }: { customerId: number; propertyId: number; memo: string }) {
  const action = saveMatchNote.bind(null, customerId, propertyId);
  const [state, formAction, pending] = useActionState<MemoState, FormData>(action, { savedAt: null, error: null });

  return (
    <form action={formAction} className="space-y-2">
      <textarea name="memo" className="input" rows={4} defaultValue={memo} placeholder="例：9/20 に電話で紹介済み。週末内覧の可能性あり" />
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-secondary" disabled={pending}>
          {pending ? "保存中…" : "メモを保存"}
        </button>
        {state.savedAt && <span className="text-sm text-green-700">保存しました（{state.savedAt}）</span>}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
