"use client";

import { useEffect, useState } from "react";
import type { AreaOption } from "@/types";
import { AREA_LABELS } from "@/types/constants";

interface Stats {
  totalUsers: number;
  bannedUsers: number;
  totalMatches: number;
  activeMatches: number;
  totalReviews: number;
  totalInvites: number;
  usedInvites: number;
  avgCommunication: number;
  avgPunctuality: number;
  avgMeetAgain: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentUsers, setRecentUsers] = useState<{ id: string; nickname: string; created_at: string }[]>([]);
  const [recentMatches, setRecentMatches] = useState<{ id: string; area: string; date: string; status: string; created_at: string }[]>([]);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        setStats(data.stats);
        setRecentUsers(data.recentUsers || []);
        setRecentMatches(data.recentMatches || []);
      });
  }, []);

  if (!stats) {
    return <div className="text-gray-400 text-base p-8">読み込み中...</div>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">ダッシュボード</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mb-10">
        <StatCard label="総ユーザー数" value={stats.totalUsers} />
        <StatCard label="BANユーザー" value={stats.bannedUsers} color="red" />
        <StatCard label="総マッチ数" value={stats.totalMatches} />
        <StatCard label="アクティブマッチ" value={stats.activeMatches} color="green" />
        <StatCard label="総レビュー数" value={stats.totalReviews} />
        <StatCard label="招待コード発行" value={stats.totalInvites} />
        <StatCard label="招待コード使用" value={stats.usedInvites} />
        <StatCard label="平均話しやすさ" value={stats.avgCommunication} suffix="/5" />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="font-semibold text-lg mb-4">最近のユーザー登録</h3>
          <div className="space-y-3">
            {recentUsers.map((u) => (
              <div key={u.id} className="flex justify-between text-sm">
                <span>{u.nickname || "未設定"}</span>
                <span className="text-gray-400 text-xs">
                  {new Date(u.created_at).toLocaleDateString("ja-JP")}
                </span>
              </div>
            ))}
            {recentUsers.length === 0 && (
              <p className="text-sm text-gray-400">データなし</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-6">
          <h3 className="font-semibold text-lg mb-4">最近のマッチング</h3>
          <div className="space-y-3">
            {recentMatches.map((m) => (
              <div key={m.id} className="flex justify-between text-sm">
                <span>{AREA_LABELS[m.area as AreaOption] || m.area} - {m.date}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  m.status === "confirmed" ? "bg-green-50 text-green-600" :
                  m.status === "completed" ? "bg-gray-50 text-gray-500" :
                  m.status === "cancelled" ? "bg-red-50 text-red-500" :
                  "bg-yellow-50 text-yellow-600"
                }`}>
                  {m.status}
                </span>
              </div>
            ))}
            {recentMatches.length === 0 && (
              <p className="text-sm text-gray-400">データなし</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, suffix }: { label: string; value: number; color?: string; suffix?: string }) {
  const textColor = color === "red" ? "text-red-500" : color === "green" ? "text-green-500" : "text-foreground";
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <p className={`text-3xl font-bold ${textColor}`}>
        {value}{suffix}
      </p>
    </div>
  );
}
