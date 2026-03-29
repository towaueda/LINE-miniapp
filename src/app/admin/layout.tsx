"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "ダッシュボード", icon: "📊" },
  { href: "/admin/users", label: "ユーザー", icon: "👥" },
  { href: "/admin/matches", label: "マッチング", icon: "🔗" },
  { href: "/admin/reviews", label: "レビュー", icon: "⭐" },
  { href: "/admin/notifications", label: "お知らせ", icon: "📢" },
  { href: "/admin/invites", label: "招待コード", icon: "🎟️" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 fixed h-full flex flex-col">
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
      <main className="ml-64 flex-1 p-8 min-h-screen">
        {children}
      </main>
    </div>
  );
}
