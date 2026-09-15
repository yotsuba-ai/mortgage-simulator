import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDate, formatManYen, formatNumber } from "@/lib/format";
import { rankCustomersForProperty } from "@/lib/queries";
import { propertyTypeLabel } from "@/lib/types";
import { DetailList } from "@/components/DetailList";
import { EmptyState } from "@/components/EmptyState";
import { MatchSummary } from "@/components/MatchSummary";
import { PageHeader } from "@/components/PageHeader";
import { PriorityBadge } from "@/components/PriorityBadge";
import { ScoreBadge } from "@/components/ScoreBadge";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const propertyId = Number(id);
  if (!Number.isInteger(propertyId)) notFound();
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) notFound();

  const ranking = await rankCustomersForProperty(property);

  return (
    <div className="space-y-6">
      <PageHeader
        title={property.name}
        sub={
          <span>
            <span className="text-lg font-bold text-gray-900">{formatManYen(property.price)}</span>
            <span className="ml-2">{propertyTypeLabel(property.propertyType)}</span>
            <span className="ml-2 text-gray-400">|</span>
            <span className="ml-2">登録 {formatDate(property.createdAt)}</span>
          </span>
        }
        actions={
          <Link href={`/properties/${property.id}/edit`} className="btn-secondary">
            編集
          </Link>
        }
      />

      <section className="card">
        <h2 className="mb-2 font-bold">物件情報</h2>
        <DetailList
          items={[
            { label: "住所", value: property.address || "未登録" },
            { label: "エリア", value: property.area || "未登録" },
            { label: "部屋数", value: property.bedrooms != null ? `${property.bedrooms}部屋` : "未登録" },
            { label: "駐車場", value: property.parkingSpaces != null ? `${property.parkingSpaces}台` : "未登録" },
            { label: "築年数", value: property.buildingAge != null ? `築${property.buildingAge}年` : "未登録" },
            { label: "学校区", value: property.schoolDistrict || "未登録" },
            { label: "土地面積", value: formatNumber(property.landArea, "㎡") },
            { label: "建物面積", value: formatNumber(property.buildingArea, "㎡") },
          ]}
        />
        {property.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{property.notes}</p>}
      </section>

      <section>
        <h2 className="mb-2 text-base font-bold">この物件を提案すべき顧客</h2>
        {ranking.length === 0 ? (
          <EmptyState>顧客が登録されていません</EmptyState>
        ) : (
          <ol className="space-y-2">
            {ranking.map(({ customer, match }, i) => (
              <li key={customer.id} className="card p-0">
                <Link href={`/match/${customer.id}/${property.id}`} className="flex gap-3 p-4 hover:bg-gray-50">
                  <div className="w-8 shrink-0 text-center text-lg font-bold text-gray-500">{i + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <PriorityBadge priority={customer.priority} />
                        <span className="truncate text-base font-bold">{customer.name} 様</span>
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
