export function PageHeader({ title, actions, sub }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {sub && <div className="mt-1 text-sm text-gray-600">{sub}</div>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
