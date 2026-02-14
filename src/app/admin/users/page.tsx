"use client";

import { useEffect, useState, useCallback } from "react";
import { DbUser, AREA_LABELS, AreaOption } from "@/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<DbUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const fetchUsers = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), search, filter });
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(data.users);
    setTotal(data.total);
  }, [page, search, filter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleBan = async (userId: string) => {
    const reason = prompt("BAN理由を入力してください:");
    if (reason === null) return;
    await fetch(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    fetchUsers();
  };

  const handleUnban = async (userId: string) => {
    await fetch(`/api/admin/users/${userId}/ban`, { method: "DELETE" });
    fetchUsers();
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ユーザー管理</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="ニックネーム / LINE ID で検索"
          className="px-4 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-orange flex-1 max-w-xs"
        />
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none"
        >
          <option value="all">すべて</option>
          <option value="active">アクティブ</option>
          <option value="banned">BAN済み</option>
        </select>
        <span className="text-sm text-gray-400 self-center">{total}件</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">ユーザー</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">エリア</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">職種</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">登録日</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">状態</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{u.avatar_emoji || "👤"}</span>
                    <div>
                      <p className="font-medium">{u.nickname || "未設定"}</p>
                      <p className="text-xs text-gray-400">{u.age_group}歳</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {u.area ? AREA_LABELS[u.area as AreaOption] : "-"}
                </td>
                <td className="px-4 py-3 text-gray-600">{u.job || "-"}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(u.created_at).toLocaleDateString("ja-JP")}
                </td>
                <td className="px-4 py-3">
                  {u.is_banned ? (
                    <span className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-full">BAN</span>
                  ) : (
                    <span className="text-xs bg-green-50 text-green-500 px-2 py-1 rounded-full">Active</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.is_banned ? (
                    <button
                      onClick={() => handleUnban(u.id)}
                      className="text-xs text-blue-500 hover:underline"
                    >
                      解除
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBan(u.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      BAN
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
