import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatManYen } from "@/lib/format";
import { byStatus, matchCustomerProperty } from "@/lib/matching";
import { toConditions, toPropertyInfo } from "@/lib/queries";
import { propertyTypeLabel } from "@/lib/types";
import { MemoForm } from "@/components/MemoForm";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ProposalPanel } from "@/components/ProposalPanel";
import { ScoreBadge } from "@/components/ScoreBadge";
import { StatusMark } from "@/components/StatusMark";

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({ params }: { params: Promise<{ customerId: string; propertyId: string }> }) {
  const p = await params;
  const customerId = Number(p.customerId);
  const propertyId = Number(p.propertyId);
  if (!Number.isInteger(customerId) || !Number.isInteger(propertyId)) notFound();

  const [customer, property, note] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.property.findUnique({ where: { id: propertyId } }),
    prisma.matchNote.findUnique({ where: { customerId_propertyId: { customerId, propertyId } } }),
  ]);
  if (!customer || !property) notFound();

  const match = matchCustomerProperty(toConditions(customer), toPropertyInfo(property));
  const points = byStatus(match, "MATCH");
  const concerns = [...byStatus(match, "MISMATCH"), ...byStatus(match, "PARTIAL")];
  const unknown = byStatus(match, "UNKNOWN");

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Link href={`/customers/${customer.id}`} className="flex items-center gap-2 text-lg font-bold hover:underline">
              <PriorityBadge priority={customer.priority} />
              {customer.name} 様
            </Link>
            <div className="text-sm text-gray-500">×</div>
            <Link href={`/properties/${property.id}`} className="block font-bold hover:underline">
              {property.name}
            </Link>
            <div className="text-sm text-gray-600">
              {formatManYen(property.price)} / {propertyTypeLabel(property.propertyType)} / {property.area ?? "エリア未設定"}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-xs text-gray-500">総合スコア</div>
            <ScoreBadge total={match.total} size="lg" />
            <div className="mt-1 text-xs text-gray-500">
              判定 {match.evaluatedCount}/{match.criteriaCount}項目
            </div>
          </div>
        </div>
      </section>

      <section className="card p-0">
        <h2 className="border-b border-gray-200 px-4 py-3 font-bold">条件ごとの判定</h2>
        <table className="w-full text-sm">
          <tbody>
            {match.criteria.map((c) => (
              <tr key={c.key} className="border-b border-gray-100 last:border-b-0">
                <td className="w-24 px-4 py-2.5 font-medium text-gray-800">{c.label}</td>
                <td className="w-10 px-1 py-2.5 text-center">
                  <StatusMark status={c.status} />
                </td>
                <td className="px-2 py-2.5 text-gray-700">{c.reason}</td>
                <td className="w-16 px-4 py-2.5 text-right tabular-nums text-gray-500">
                  {c.status === "UNKNOWN" ? "—" : `${c.score}/${c.weight}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card">
          <h2 className="mb-2 flex items-center gap-2 font-bold">
            <StatusMark status="MATCH" /> 提案ポイント
          </h2>
          {points.length === 0 ? (
            <p className="text-sm text-gray-400">一致した条件はありません</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-800">
              {points.map((c) => (
                <li key={c.key}>
                  <span className="font-medium">{c.label}：</span>
                  {c.reason}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2 className="mb-2 flex items-center gap-2 font-bold">
            <StatusMark status="MISMATCH" /> 懸念点
          </h2>
          {concerns.length === 0 ? (
            <p className="text-sm text-gray-400">懸念点はありません</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-800">
              {concerns.map((c) => (
                <li key={c.key}>
                  <span className="font-medium">{c.label}：</span>
                  {c.reason}
                </li>
              ))}
            </ul>
          )}
          {unknown.length > 0 && (
            <div className="mt-3 border-t border-gray-100 pt-2">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-600">
                <StatusMark status="UNKNOWN" /> 要確認（データ不足）
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
                {unknown.map((c) => (
                  <li key={c.key}>
                    <span className="font-medium">{c.label}：</span>
                    {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="mb-2 font-bold">営業担当者向けメモ</h2>
        {(customer.notes || property.notes) && (
          <div className="mb-3 space-y-1 rounded-md bg-gray-50 p-3 text-sm text-gray-700">
            {customer.notes && (
              <p>
                <span className="font-medium">顧客メモ：</span>
                {customer.notes}
              </p>
            )}
            {property.notes && (
              <p>
                <span className="font-medium">物件メモ：</span>
                {property.notes}
              </p>
            )}
          </div>
        )}
        <MemoForm customerId={customer.id} propertyId={property.id} memo={note?.memo ?? ""} />
      </section>

      <section className="card">
        <h2 className="mb-2 font-bold">提案文</h2>
        <ProposalPanel customerId={customer.id} propertyId={property.id} />
      </section>
    </div>
  );
}
