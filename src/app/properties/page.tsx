import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate, formatManYen } from "@/lib/format";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS, isPropertyType, propertyTypeLabel } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type Search = { q?: string; type?: string; maxPrice?: string };

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const type = isPropertyType(sp.type) ? sp.type : "";
  const maxPrice = sp.maxPrice && /^\d+$/.test(sp.maxPrice) ? Number(sp.maxPrice) : null;

  const where: Prisma.PropertyWhereInput = {};
  if (q) {
    where.OR = [{ name: { contains: q } }, { address: { contains: q } }, { area: { contains: q } }, { schoolDistrict: { contains: q } }, { notes: { contains: q } }];
  }
  if (type) where.propertyType = type;
  if (maxPrice != null) where.price = { lte: maxPrice };

  const properties = await prisma.property.findMany({ where, orderBy: { createdAt: "desc" } });

  return (
    <div>
      <PageHeader
        title="物件一覧"
        sub={`${properties.length}件`}
        actions={
          <Link href="/properties/new" className="btn-primary">
            物件を追加
          </Link>
        }
      />

      <form method="get" className="card mb-4 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input name="q" className="input col-span-2 sm:col-span-1" placeholder="物件名・住所・エリアで検索" defaultValue={q} />
        <select name="type" className="input" defaultValue={type}>
          <option value="">種別：全て</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              種別：{PROPERTY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input name="maxPrice" type="number" inputMode="numeric" className="input" placeholder="価格上限（万円）" defaultValue={maxPrice ?? ""} min={0} />
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="submit" className="btn-secondary flex-1">
            絞り込む
          </button>
          {(q || type || maxPrice != null) && (
            <Link href="/properties" className="btn-secondary">
              解除
            </Link>
          )}
        </div>
      </form>

      {properties.length === 0 ? (
        <EmptyState>該当する物件がありません</EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {properties.map((p) => (
            <li key={p.id} className="card p-0">
              <Link href={`/properties/${p.id}`} className="block p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold">{p.name}</span>
                  <span className="shrink-0 font-bold tabular-nums">{formatManYen(p.price)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-gray-700">
                  <div>
                    <span className="text-gray-500">種別 </span>
                    {propertyTypeLabel(p.propertyType)}
                  </div>
                  <div>
                    <span className="text-gray-500">エリア </span>
                    {p.area ?? "—"}
                  </div>
                  <div>
                    <span className="text-gray-500">部屋 </span>
                    {p.bedrooms ?? "—"}
                    <span className="ml-2 text-gray-500">駐車 </span>
                    {p.parkingSpaces != null ? `${p.parkingSpaces}台` : "—"}
                  </div>
                  <div>
                    <span className="text-gray-500">築 </span>
                    {p.buildingAge != null ? `${p.buildingAge}年` : "—"}
                    <span className="ml-2 text-gray-500">登録 </span>
                    {formatDate(p.createdAt)}
                  </div>
                </div>
              </Link>
              <div className="border-t border-gray-100 px-4 py-2 text-right">
                <Link href={`/properties/${p.id}/edit`} className="text-sm text-blue-700 hover:underline">
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
