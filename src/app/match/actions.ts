"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { matchCustomerProperty } from "@/lib/matching";
import { generateProposal } from "@/lib/proposal";
import { toConditions, toPropertyInfo } from "@/lib/queries";

export interface MemoState {
  savedAt: string | null;
  error: string | null;
}

export async function saveMatchNote(customerId: number, propertyId: number, _prev: MemoState, formData: FormData): Promise<MemoState> {
  const memo = String(formData.get("memo") ?? "").slice(0, 5000);
  try {
    await prisma.matchNote.upsert({
      where: { customerId_propertyId: { customerId, propertyId } },
      create: { customerId, propertyId, memo },
      update: { memo },
    });
  } catch {
    return { savedAt: null, error: "保存に失敗しました" };
  }
  revalidatePath(`/match/${customerId}/${propertyId}`);
  return { savedAt: new Date().toLocaleTimeString("ja-JP"), error: null };
}

export interface ProposalState {
  text: string | null;
  error: string | null;
}

/** 「提案文を作成」ボタン用。生成ロジックは lib/proposal に集約（LLM差し替え可能） */
export async function createProposal(customerId: number, propertyId: number): Promise<ProposalState> {
  const [customer, property] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.property.findUnique({ where: { id: propertyId } }),
  ]);
  if (!customer || !property) return { text: null, error: "顧客または物件が見つかりません" };
  const cond = toConditions(customer);
  const info = toPropertyInfo(property);
  const match = matchCustomerProperty(cond, info);
  try {
    const text = await generateProposal({ customer: cond, property: info, match });
    return { text, error: null };
  } catch {
    return { text: null, error: "提案文の生成に失敗しました" };
  }
}
