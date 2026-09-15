import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "顧客×物件マッチング",
  description: "顧客と物件の条件マッチングによる営業支援ツール",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const NAV = [
  { href: "/", label: "ホーム" },
  { href: "/customers", label: "顧客" },
  { href: "/properties", label: "物件" },
  { href: "/import", label: "CSV取込" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
            <Link href="/" className="shrink-0 text-base font-bold text-gray-900">
              顧客×物件マッチング
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-md px-2 py-2 font-medium text-gray-700 hover:bg-gray-100 sm:px-3">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 pb-10">{children}</main>
      </body>
    </html>
  );
}
