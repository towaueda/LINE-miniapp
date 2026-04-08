"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード", icon: "📊" },
  { href: "/admin/users", label: "ユーザー", icon: "👥" },
  { href: "/admin/waiting", label: "待機中", icon: "⏳" },
  { href: "/admin/matches", label: "マッチング", icon: "🔗" },
  { href: "/admin/reviews", label: "レビュー", icon: "⭐" },
  { href: "/admin/invites", label: "招待コード", icon: "🎟️" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.body.style.maxWidth = "none";
    document.body.style.margin = "0";
    return () => {
      document.body.style.maxWidth = "";
      document.body.style.margin = "";
    };
  }, []);

  // サイドバー外タップで閉じる
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 bg-white border-r border-gray-200 fixed h-full flex flex-col z-40 transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      >
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-xl font-bold">
            <span className="text-orange">Tri</span>angle Admin
          </h1>
        </div>
        <nav className="p-3 flex-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base mb-1 transition-colors ${
                pathname === item.href
                  ? "bg-orange/10 text-orange font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <button
            onClick={async () => {
              await fetch("/api/admin/auth", { method: "DELETE" });
              router.push("/admin/login");
            }}
            className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 hover:bg-gray-50 rounded-lg transition-colors"
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="メニューを開く"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-base font-bold">
            <span className="text-orange">Tri</span>angle Admin
          </h1>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
