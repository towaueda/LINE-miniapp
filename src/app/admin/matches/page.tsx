"use client";

import { useEffect, useState, useCallback } from "react";
import type { AreaOption } from "@/types";
import { AREA_LABELS } from "@/types/constants";

interface MatchWithMembers {
  id: string;
  area: string;
  date: string;
  time: string;
  restaurant_name: string;
  status: string;
  created_at: string;
  members: { id: string; nickname: string; avatar_emoji: string }[];
}

const STATUS_OPTIONS = [
  { value: "", label: "すべて" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<MatchWithMembers[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchMatches = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/matches?${params}`);
    const data = await res.json();
    setMatches(data.matches);
    setTotal(data.total);
  }, [page, statusFilter]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const updateStatus = async (matchId: string, status: string) => {
    await fetch(`/api/admin/matches/${matchId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchMatches();
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">マッチング管理</h1>

      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-sm text-gray-400 self-center">{total}件</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">エリア</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">日程</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">レストラン</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">メンバー</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">ステータス</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-t border-gray-50">
                <td className="px-4 py-3">{AREA_LABELS[m.area as AreaOption] || m.area}</td>
                <td className="px-4 py-3">{m.date} {m.time}</td>
                <td className="px-4 py-3">{m.restaurant_name}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {m.members.map((member) => (
                      <span key={member.id} title={member.nickname || ""}>
                        {member.avatar_emoji || "👤"}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    m.status === "confirmed" ? "bg-green-50 text-green-600" :
                    m.status === "completed" ? "bg-gray-50 text-gray-500" :
                    m.status === "cancelled" ? "bg-red-50 text-red-500" :
                    "bg-yellow-50 text-yellow-600"
                  }`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {m.status !== "cancelled" && (
                    <button
                      onClick={() => updateStatus(m.id, "cancelled")}
                      className="text-xs text-red-500 hover:underline"
                    >
                      キャンセル
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`w-8 h-8 rounded-lg text-sm ${
                page === i + 1 ? "bg-orange text-white" : "bg-white text-gray-500 border border-gray-200"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
