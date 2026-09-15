import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate, formatManYen } from "@/lib/format";
import { rankPropertiesForCustomer } from "@/lib/queries";
import { PRIORITY_LABELS, isPriority, parseAreas, propertyTypeLabel } from "@/lib/types";
import { DetailList } from "@/components/DetailList";
import { EmptyState } from "@/components/EmptyState";
import { MatchSummary } from "@/components/MatchSummary";
import { PageHeader } from "@/components/PageHeader";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ScoreBadge } from "@/components/ScoreBadge";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customerId = Number(id);
  if (!Number.isInteger(customerId)) notFound();
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) notFound();

  const top = await rankPropertiesForCustomer(customer, 5);
  const areas = parseAreas(customer.preferredAreas);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${customer.name} 様`}
        sub={
          <span className="inline-flex items-center gap-2">
            <PriorityBadge priority={customer.priority} />
            {isPriority(customer.priority) ? PRIORITY_LABELS[customer.priority] : customer.priority}
            <span className="text-gray-400">|</span>
            最終接触 {formatDate(customer.lastContactedAt)}
          </span>
        }
        actions={
          <Link href={`/customers/${customer.id}/edit`} className="btn-secondary">
            編集
          </Link>
        }
      />

      <section className="card">
        <h2 className="mb-2 font-bold">希望条件</h2>
        <DetailList
          items={[
            {
              label: "予算",
              value:
                customer.budgetMin == null && customer.budgetMax == null
                  ? "未設定"
                  : `${customer.budgetMin != null ? formatManYen(customer.budgetMin) : ""}〜${customer.budgetMax != null ? formatManYen(customer.budgetMax) : ""}`,
            },
            { label: "希望エリア", value: areas.length ? areas.join("・") : "未設定" },
            { label: "物件種別", value: customer.propertyType ? propertyTypeLabel(customer.propertyType) : "こだわらない" },
            { label: "部屋数", value: customer.minBedrooms != null ? `${customer.minBedrooms}部屋以上` : "未設定" },
            { label: "駐車場", value: customer.parkingSpaces != null ? (customer.parkingSpaces === 0 ? "不要" : `${customer.parkingSpaces}台`) : "未設定" },
            { label: "築年数", value: customer.maxBuildingAge != null ? `築${customer.maxBuildingAge}年以内` : "未設定" },
            { label: "学校区", value: customer.schoolDistrict || "未設定" },
          ]}
        />
      </section>

      <section className="card">
        <h2 className="mb-2 font-bold">メモ</h2>
        <p className="whitespace-pre-wrap text-sm text-gray-800">{customer.notes || <span className="text-gray-400">メモはありません</span>}</p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-bold">おすすめ物件 TOP5</h2>
        {top.length === 0 ? (
          <EmptyState>物件が登録されていません</EmptyState>
        ) : (
          <ol className="space-y-2">
            {top.map(({ property, match }, i) => (
              <li key={property.id} className="card p-0">
                <Link href={`/match/${customer.id}/${property.id}`} className="flex gap-3 p-4 hover:bg-gray-50">
                  <div className="w-8 shrink-0 text-center text-lg font-bold text-gray-500">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-bold">{property.name}</div>
                        <div className="text-xs text-gray-500">
                          {formatManYen(property.price)} / {propertyTypeLabel(property.propertyType)} / {property.area ?? "エリア未設定"}
                        </div>
                      </div>
                      <ScoreBadge total={match.total} />
                    </div>
                    <div className="mt-2">
                      <MatchSummary match={match} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
