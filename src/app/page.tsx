import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, formatManYen } from "@/lib/format";
import { propertyTypeLabel, parseAreas } from "@/lib/types";
import { PriorityBadge } from "@/components/PriorityBadge";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [customerCount, propertyCount, recentProperties, recentCustomers] = await Promise.all([
    prisma.customer.count(),
    prisma.property.count(),
    prisma.property.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.customer.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Link href="/customers" className="card hover:bg-gray-50">
          <div className="text-sm text-gray-500">顧客数</div>
          <div className="text-3xl font-bold tabular-nums">{customerCount}</div>
        </Link>
        <Link href="/properties" className="card hover:bg-gray-50">
          <div className="text-sm text-gray-500">物件数</div>
          <div className="text-3xl font-bold tabular-nums">{propertyCount}</div>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/properties/new" className="btn-primary">
          物件を追加
        </Link>
        <Link href="/customers/new" className="btn-secondary">
          顧客を追加
        </Link>
        <Link href="/import" className="btn-secondary">
          CSV取込
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-base font-bold">最近登録した物件</h2>
        {recentProperties.length === 0 ? (
          <EmptyState>物件がまだありません</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentProperties.map((p) => (
              <li key={p.id}>
                <Link href={`/properties/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">
                      {propertyTypeLabel(p.propertyType)} / {p.area ?? "エリア未設定"} / {formatDate(p.createdAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-bold tabular-nums">{formatManYen(p.price)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-base font-bold">最近更新した顧客</h2>
        {recentCustomers.length === 0 ? (
          <EmptyState>顧客がまだありません</EmptyState>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentCustomers.map((c) => (
              <li key={c.id}>
                <Link href={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <PriorityBadge priority={c.priority} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name} 様</div>
                    <div className="truncate text-xs text-gray-500">
                      {parseAreas(c.preferredAreas).join("・") || "エリア未設定"} / 上限{formatManYen(c.budgetMax)} / 更新 {formatDate(c.updatedAt)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
