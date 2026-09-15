import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card text-center">
      <p className="text-gray-700">ページが見つかりません。</p>
      <Link href="/" className="btn-secondary mt-4">
        ホームへ戻る
      </Link>
    </div>
  );
}
