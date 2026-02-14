"use client";

import { useEffect, useState, useCallback } from "react";

interface Notification {
  id: string;
  title: string;
  body: string;
  is_global: boolean;
  target_user_id: string | null;
  created_at: string;
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isGlobal, setIsGlobal] = useState(true);
  const [targetUserId, setTargetUserId] = useState("");
  const [sending, setSending] = useState(false);

  const fetchNotifications = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    const res = await fetch(`/api/admin/notifications?${params}`);
    const data = await res.json();
    setNotifications(data.notifications);
    setTotal(data.total);
  }, [page]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !body) return;
    setSending(true);

    await fetch("/api/admin/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        isGlobal,
        targetUserId: isGlobal ? null : targetUserId,
      }),
    });

    setTitle("");
    setBody("");
    setTargetUserId("");
    setSending(false);
    fetchNotifications();
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">お知らせ配信</h1>

      {/* Send Form */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <h3 className="font-semibold mb-4">新規配信</h3>
        <form onSubmit={handleSend} className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-orange"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="本文"
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-orange resize-none"
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={isGlobal}
                onChange={() => setIsGlobal(true)}
              />
              全体配信
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={!isGlobal}
                onChange={() => setIsGlobal(false)}
              />
              個別配信
            </label>
            {!isGlobal && (
              <input
                type="text"
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder="ユーザーID"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none flex-1"
              />
            )}
          </div>
          <button
            type="submit"
            disabled={!title || !body || sending || (!isGlobal && !targetUserId)}
            className="bg-orange hover:bg-orange-dark disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 px-6 rounded-lg text-sm transition-all"
          >
            {sending ? "送信中..." : "送信"}
          </button>
        </form>
      </div>

      {/* History */}
      <h3 className="font-semibold mb-3">配信履歴 ({total}件)</h3>
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">タイトル</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">本文</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">種別</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">日時</th>
            </tr>
          </thead>
          <tbody>
            {notifications.map((n) => (
              <tr key={n.id} className="border-t border-gray-50">
                <td className="px-4 py-3 font-medium">{n.title}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[300px] truncate">{n.body}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    n.is_global ? "bg-blue-50 text-blue-500" : "bg-gray-50 text-gray-500"
                  }`}>
                    {n.is_global ? "全体" : "個別"}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(n.created_at).toLocaleString("ja-JP")}
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
