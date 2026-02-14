"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [isAuthed, setIsAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (pathname === "/admin/login") {
      setChecking(false);
      return;
    }

    const token = document.cookie.includes("admin_token");
    if (!token) {
      router.push("/admin/login");
    } else {
      setIsAuthed(true);
    }
    setChecking(false);
  }, [pathname, router]);

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (checking || !isAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-3 border-orange border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 fixed h-full">
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-lg font-bold">
            <span className="text-orange">Tri</span>angle Admin
          </h1>
        </div>
        <nav className="p-2">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm mb-0.5 transition-colors ${
                pathname === item.href
                  ? "bg-orange/10 text-orange font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <button
            onClick={async () => {
              await fetch("/api/admin/auth", { method: "DELETE" });
              router.push("/admin/login");
            }}
            className="w-full text-sm text-gray-400 hover:text-gray-600 py-2"
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 flex-1 p-6">
        {children}
      </main>
    </div>
  );
}
