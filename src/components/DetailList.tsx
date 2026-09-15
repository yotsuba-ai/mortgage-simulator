/** 詳細画面の「ラベル: 値」一覧 */
export function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline justify-between gap-3 border-b border-gray-100 py-1.5 text-sm sm:justify-start">
          <dt className="w-28 shrink-0 text-gray-500">{it.label}</dt>
          <dd className="text-right font-medium text-gray-900 sm:text-left">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
