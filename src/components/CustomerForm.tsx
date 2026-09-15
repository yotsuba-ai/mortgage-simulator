"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { Customer } from "@prisma/client";
import { saveCustomer } from "@/app/customers/actions";
import { toDateInputValue } from "@/lib/format";
import { PRIORITIES, PRIORITY_LABELS, PROPERTY_TYPES, PROPERTY_TYPE_LABELS, parseAreas } from "@/lib/types";
import { initialFormState } from "@/lib/validation";
import { FormField } from "./FormField";

export function CustomerForm({ customer }: { customer?: Customer }) {
  const action = saveCustomer.bind(null, customer?.id ?? null);
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const v = state.values;
  const e = state.errors;
  const num = (n: number | null | undefined) => (n == null ? "" : String(n));

  return (
    <form action={formAction} className="card grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label="氏名 *" error={e.name}>
          <input name="name" className="input" required defaultValue={v.name ?? customer?.name ?? ""} placeholder="例：山田 太郎" />
        </FormField>
      </div>

      <FormField label="優先度" error={e.priority}>
        <select name="priority" className="input" defaultValue={v.priority ?? customer?.priority ?? "B"}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="最終接触日" error={e.lastContactedAt}>
        <input type="date" name="lastContactedAt" className="input" defaultValue={v.lastContactedAt ?? toDateInputValue(customer?.lastContactedAt)} />
      </FormField>

      <FormField label="予算下限（万円）" error={e.budgetMin}>
        <input type="number" inputMode="numeric" name="budgetMin" className="input" min={0} defaultValue={v.budgetMin ?? num(customer?.budgetMin)} placeholder="例：2500" />
      </FormField>

      <FormField label="予算上限（万円）" error={e.budgetMax}>
        <input type="number" inputMode="numeric" name="budgetMax" className="input" min={0} defaultValue={v.budgetMax ?? num(customer?.budgetMax)} placeholder="例：3500" />
      </FormField>

      <div className="sm:col-span-2">
        <FormField label="希望エリア" error={e.preferredAreas} hint="複数ある場合は「、」または「|」で区切ってください">
          <input name="preferredAreas" className="input" defaultValue={v.preferredAreas ?? parseAreas(customer?.preferredAreas).join("、")} placeholder="例：緑町、桜ヶ丘" />
        </FormField>
      </div>

      <FormField label="希望物件種別" error={e.propertyType}>
        <select name="propertyType" className="input" defaultValue={v.propertyType ?? customer?.propertyType ?? ""}>
          <option value="">こだわらない</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PROPERTY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="希望部屋数（以上）" error={e.minBedrooms} hint="3LDK なら 3">
        <input type="number" inputMode="numeric" name="minBedrooms" className="input" min={0} max={20} defaultValue={v.minBedrooms ?? num(customer?.minBedrooms)} />
      </FormField>

      <FormField label="駐車場希望台数" error={e.parkingSpaces} hint="不要なら 0">
        <input type="number" inputMode="numeric" name="parkingSpaces" className="input" min={0} max={20} defaultValue={v.parkingSpaces ?? num(customer?.parkingSpaces)} />
      </FormField>

      <FormField label="築年数上限（年）" error={e.maxBuildingAge}>
        <input type="number" inputMode="numeric" name="maxBuildingAge" className="input" min={0} max={200} defaultValue={v.maxBuildingAge ?? num(customer?.maxBuildingAge)} />
      </FormField>

      <div className="sm:col-span-2">
        <FormField label="希望学校区" error={e.schoolDistrict}>
          <input name="schoolDistrict" className="input" defaultValue={v.schoolDistrict ?? customer?.schoolDistrict ?? ""} placeholder="例：緑小学校" />
        </FormField>
      </div>

      <div className="sm:col-span-2">
        <FormField label="メモ" error={e.notes}>
          <textarea name="notes" className="input" rows={4} defaultValue={v.notes ?? customer?.notes ?? ""} />
        </FormField>
      </div>

      {e._ && <p className="field-error sm:col-span-2">{e._}</p>}

      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </button>
        <Link href={customer ? `/customers/${customer.id}` : "/customers"} className="btn-secondary">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
