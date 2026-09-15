"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Property } from "@prisma/client";
import { saveProperty } from "@/app/properties/actions";
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from "@/lib/types";
import { initialFormState } from "@/lib/validation";
import { FormField } from "./FormField";

export function PropertyForm({ property }: { property?: Property }) {
  const action = saveProperty.bind(null, property?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const v = state.values;
  const e = state.errors;
  const num = (n: number | null | undefined) => (n == null ? "" : String(n));

  return (
    <form action={formAction} className="card grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label="物件名 *" error={e.name}>
          <input name="name" className="input" required defaultValue={v.name ?? property?.name ?? ""} placeholder="例：緑町3丁目 中古戸建" />
        </FormField>
      </div>

      <FormField label="価格（万円）" error={e.price}>
        <input type="number" inputMode="numeric" name="price" className="input" min={0} defaultValue={v.price ?? num(property?.price)} placeholder="例：3280" />
      </FormField>

      <FormField label="物件種別" error={e.propertyType}>
        <select name="propertyType" className="input" defaultValue={v.propertyType ?? property?.propertyType ?? ""}>
          <option value="">未設定</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROPERTY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>

      <div className="sm:col-span-2">
        <FormField label="住所" error={e.address}>
          <input name="address" className="input" defaultValue={v.address ?? property?.address ?? ""} placeholder="例：○○市緑町3-12-5" />
        </FormField>
      </div>

      <FormField label="エリア" error={e.area} hint="顧客の希望エリアと突き合わせる名称（町名など）">
        <input name="area" className="input" defaultValue={v.area ?? property?.area ?? ""} placeholder="例：緑町" />
      </FormField>

      <FormField label="学校区" error={e.schoolDistrict}>
        <input name="schoolDistrict" className="input" defaultValue={v.schoolDistrict ?? property?.schoolDistrict ?? ""} placeholder="例：緑小学校" />
      </FormField>

      <FormField label="部屋数" error={e.bedrooms} hint="4LDK なら 4">
        <input type="number" inputMode="numeric" name="bedrooms" className="input" min={0} max={20} defaultValue={v.bedrooms ?? num(property?.bedrooms)} />
      </FormField>

      <FormField label="駐車場台数" error={e.parkingSpaces}>
        <input type="number" inputMode="numeric" name="parkingSpaces" className="input" min={0} max={20} defaultValue={v.parkingSpaces ?? num(property?.parkingSpaces)} />
      </FormField>

      <FormField label="築年数（年）" error={e.buildingAge} hint="新築は 0">
        <input type="number" inputMode="numeric" name="buildingAge" className="input" min={0} max={200} defaultValue={v.buildingAge ?? num(property?.buildingAge)} />
      </FormField>

      <FormField label="土地面積（㎡）" error={e.landArea}>
        <input type="number" inputMode="decimal" step="0.01" name="landArea" className="input" min={0} defaultValue={v.landArea ?? num(property?.landArea)} />
      </FormField>

      <FormField label="建物面積（㎡）" error={e.buildingArea}>
        <input type="number" inputMode="decimal" step="0.01" name="buildingArea" className="input" min={0} defaultValue={v.buildingArea ?? num(property?.buildingArea)} />
      </FormField>

      <div className="sm:col-span-2">
        <FormField label="メモ" error={e.notes}>
          <textarea name="notes" className="input" rows={4} defaultValue={v.notes ?? property?.notes ?? ""} />
        </FormField>
      </div>

      {e._ && <p className="field-error sm:col-span-2">{e._}</p>}

      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </button>
        <Link href={property ? `/properties/${property.id}` : "/properties"} className="btn-secondary">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
