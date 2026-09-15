import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatManYen } from "@/lib/format";
import { PRIORITIES, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, isPriority, isPropertyType, parseAreas, propertyTypeLabel } from "@/lib/types";
import { PriorityBadge } from "@/components/PriorityBadge";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type Search = { q?: string; priority?: string; type?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const priority = isPriority(sp.priority) ? sp.priority : "";
  const type = isPropertyType(sp.type) ? sp.type : "";

  const where: Prisma.CustomerWhereInput = {};
  if (q) {
    where.OR = [{ name: { contains: q } }, { preferredAreas: { contains: q } }, { schoolDistrict: { contains: q } }, { notes: { contains: q } }];
  }
  if (priority) where.priority = priority;
  if (type) where.propertyType = type;

  const customers = await prisma.customer.findMany({ where, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }] });

  return (
    <div>
      <PageHeader
        title="顧客一覧"
        sub={`${customers.length}件`}
        actions={
          <Link href="/customers/new" className="btn-primary">
            顧客を追加
          </Link>
        }
      />

      <form method="get" className="card mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input name="q" className="input col-span-2 sm:col-span-1" placeholder="氏名・エリア・学校区・メモで検索" defaultValue={q} />
        <select name="priority" className="input" defaultValue={priority}>
          <option value="">優先度：全て</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              優先度：{p}
            </option>
          ))}
        </select>
        <select name="type" className="input" defaultValue={type}>
          <option value="">種別：全て</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              種別：{PROPERTY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className="btn-secondary flex-1">
            絞り込む
          </button>
          {(q || priority || type) && (
            <Link href="/customers" className="btn-secondary">
              解除
            </Link>
          )}
        </div>
      </form>

      {customers.length === 0 ? (
        <EmptyState>該当する顧客がいません</EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {customers.map((c) => (
            <li key={c.id} className="card p-0">
              <Link href={`/customers/${c.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={c.priority} />
                  <span className="text-base font-bold">{c.name} 様</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-gray-700">
                  <div>
                    <span className="text-gray-500">予算 </span>
                    {c.budgetMax != null ? `〜${formatManYen(c.budgetMax)}` : "—"}
                  </div>
                  <div>
                    <span className="text-gray-500">種別 </span>
                    {c.propertyType ? propertyTypeLabel(c.propertyType) : "—"}
                  </div>
                  <div className="col-span-2 truncate">
                    <span className="text-gray-500">エリア </span>
                    {parseAreas(c.preferredAreas).join("・") || "—"}
                  </div>
                  <div>
                    <span className="text-gray-500">部屋 </span>
                    {c.minBedrooms != null ? `${c.minBedrooms}以上` : "—"}
                    <span className="ml-2 text-gray-500">駐車 </span>
                    {c.parkingSpaces != null ? `${c.parkingSpaces}台` : "—"}
                  </div>
                  <div>
                    <span className="text-gray-500">最終接触 </span>
                    {formatDate(c.lastContactedAt)}
                  </div>
                </div>
              </Link>
              <div className="border-t border-gray-100 px-4 py-2 text-right">
                <Link href={`/customers/${c.id}/edit`} className="text-sm text-blue-700 hover:underline">
                  編集
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
