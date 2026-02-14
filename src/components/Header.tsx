"use client";

import { useLiff } from "./LiffProvider";

export default function Header() {
  const { user, logout } = useLiff();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🔺</span>
        <span className="font-bold text-lg tracking-tight">
          <span className="text-orange">Tri</span>
          <span className="text-foreground">angle</span>
        </span>
      </div>
      {user?.isLoggedIn && (
        <button
          onClick={logout}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ログアウト
        </button>
      )}
    </header>
  );
}
