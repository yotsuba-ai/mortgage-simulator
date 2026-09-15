import { ImportForm } from "@/components/ImportForm";
import { PageHeader } from "@/components/PageHeader";
import { CUSTOMER_COLUMNS, PROPERTY_COLUMNS } from "@/lib/csv/validate";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="CSV取込" sub="取り込み前に全行を検証し、1行でもエラーがあれば登録しません（既存データは変更されません）。" />

      <div className="grid gap-4 sm:grid-cols-2">
        <ImportForm kind="customers" title="顧客CSV" />
        <ImportForm kind="properties" title="物件CSV" />
      </div>

      <section className="card space-y-3 text-sm">
        <h2 className="font-bold">CSV形式</h2>
        <ul className="list-disc space-y-1 pl-5 text-gray-700">
          <li>1行目はヘッダー。文字コードは UTF-8（BOM付き可）または Shift_JIS。</li>
          <li>金額は「万円」単位の整数。複数の希望エリアは「|」または「、」で区切ります。</li>
          <li>物件種別は 戸建 / マンション / 土地、優先度は A / B / C / D。空欄は「未設定」として扱います。</li>
          <li>
            サンプル：
            <a href="/samples/customers.csv" download className="ml-1 text-blue-700 underline">
              customers.csv
            </a>
            <a href="/samples/properties.csv" download className="ml-3 text-blue-700 underline">
              properties.csv
            </a>
          </li>
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColumnTable title="顧客CSVの列" columns={CUSTOMER_COLUMNS} />
          <ColumnTable title="物件CSVの列" columns={PROPERTY_COLUMNS} />
        </div>
      </section>
    </div>
  );
}

function ColumnTable({ title, columns }: { title: string; columns: { key: string; label: string; required: boolean }[] }) {
  return (
    <div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <table className="w-full text-xs">
        <tbody>
          {columns.map((c) => (
            <tr key={c.key} className="border-b border-gray-100">
              <td className="py-1 font-mono">{c.key}</td>
              <td className="py-1 text-gray-700">
                {c.label}
                {c.required && <span className="ml-1 text-red-600">必須</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
