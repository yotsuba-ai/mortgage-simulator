"use client";

import { useActionState, useState } from "react";
import { createProposal, type ProposalState } from "@/app/match/actions";
import { CopyButton } from "./CopyButton";

export function ProposalPanel({ customerId, propertyId }: { customerId: number; propertyId: number }) {
  const action = createProposal.bind(null, customerId, propertyId);
  const [state, formAction, pending] = useActionState<ProposalState>(action, { text: null, error: null });
  const [text, setText] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  // 新しい提案文が生成されたら編集用テキストを差し替える（レンダー中の派生state更新パターン）
  if (state.text !== lastGenerated) {
    setLastGenerated(state.text);
    setText(state.text ?? "");
  }

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "作成中…" : state.text ? "提案文を再作成" : "提案文を作成"}
        </button>
        {state.text && <CopyButton text={text} label="提案文をコピー" />}
      </form>
      {state.error && <p className="field-error">{state.error}</p>}
      {state.text && (
        <>
          <textarea className="input min-h-72 font-normal leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
          <p className="text-xs text-gray-500">必要に応じて文章を編集してからコピーできます。</p>
        </>
      )}
    </div>
  );
}
