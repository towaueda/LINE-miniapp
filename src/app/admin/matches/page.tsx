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

interface Message {
  id: string;
  sender_id: string | null;
  sender_name: string;
  text: string;
  is_system: boolean;
  created_at: string;
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
  const [chatMatch, setChatMatch] = useState<MatchWithMembers | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

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

  const openChat = async (match: MatchWithMembers) => {
    setChatMatch(match);
    setMessages([]);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/admin/matches/${match.id}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setChatLoading(false);
    }
  };

  const closeChat = () => {
    setChatMatch(null);
    setMessages([]);
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">マッチング管理</h1>

      <div className="flex gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-lg border border-gray-200 text-base outline-none"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span className="text-base text-gray-400 self-center">{total}件</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-4 font-medium text-gray-500">エリア</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">日程</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">レストラン</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">メンバー</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">ステータス</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">{AREA_LABELS[m.area as AreaOption] || m.area}</td>
                <td className="px-6 py-4">{m.date} {m.time}</td>
                <td className="px-6 py-4">{m.restaurant_name}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-1.5">
                    {m.members.map((member) => (
                      <span key={member.id} title={member.nickname || ""} className="text-xl">
                        {member.avatar_emoji || "👤"}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    m.status === "confirmed" ? "bg-green-50 text-green-600" :
                    m.status === "completed" ? "bg-gray-50 text-gray-500" :
                    m.status === "cancelled" ? "bg-red-50 text-red-500" :
                    "bg-yellow-50 text-yellow-600"
                  }`}>
                    {m.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openChat(m)}
                      className="text-sm text-blue-500 hover:underline"
                    >
                      チャット
                    </button>
                    {m.status !== "cancelled" && (
                      <button
                        onClick={() => updateStatus(m.id, "cancelled")}
                        className="text-sm text-red-500 hover:underline"
                      >
                        キャンセル
                      </button>
                    )}
                  </div>
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
              className={`w-10 h-10 rounded-lg text-base ${
                page === i + 1 ? "bg-orange text-white" : "bg-white text-gray-500 border border-gray-200"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Chat Modal */}
      {chatMatch && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={closeChat}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 flex flex-col"
            style={{ maxHeight: "80vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg">
                  {AREA_LABELS[chatMatch.area as AreaOption] || chatMatch.area} — {chatMatch.date} {chatMatch.time}
                </h2>
                <p className="text-sm text-gray-400 mt-0.5">
                  {chatMatch.restaurant_name} ·{" "}
                  {chatMatch.members.map((m) => m.nickname || "未設定").join("、")}
                </p>
              </div>
              <button
                onClick={closeChat}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {chatLoading && (
                <p className="text-center text-gray-400 text-sm py-8">読み込み中...</p>
              )}
              {!chatLoading && messages.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">メッセージはありません</p>
              )}
              {messages.map((msg) =>
                msg.is_system ? (
                  <div key={msg.id} className="flex justify-center">
                    <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                      {msg.text}
                    </span>
                  </div>
                ) : (
                  <div key={msg.id} className="flex gap-3">
                    <div className="flex-1">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-700">{msg.sender_name}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(msg.created_at).toLocaleString("ja-JP", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 inline-block max-w-md whitespace-pre-wrap">
                        {msg.text}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">{messages.length}件のメッセージ（読み取り専用）</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
