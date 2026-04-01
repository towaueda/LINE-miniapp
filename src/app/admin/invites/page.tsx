"use client";

import { useEffect, useState, useCallback } from "react";

interface InviteRow {
  id: string;
  code: string;
  is_active: boolean;
  used_at: string | null;
  created_at: string;
  generator: { nickname: string } | null;
  consumer: { nickname: string } | null;
}

export default function AdminInvitesPage() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [batchCount, setBatchCount] = useState("10");
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  const fetchInvites = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    const res = await fetch(`/api/admin/invites?${params}`);
    const data = await res.json();
    setInvites(data.invites);
    setTotal(data.total);
  }, [page]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: parseInt(batchCount) }),
    });
    const data = await res.json();
    setGeneratedCodes(data.codes || []);
    setGenerating(false);
    fetchInvites();
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">招待コード管理</h1>

      {/* Generate */}
      <div className="bg-white rounded-xl border border-gray-100 p-8 mb-8">
        <h3 className="font-semibold text-lg mb-4">バッチ生成</h3>
        <div className="flex gap-4 items-center">
          <input
            type="number"
            value={batchCount}
            onChange={(e) => setBatchCount(e.target.value)}
            min="1"
            max="100"
            className="w-28 px-4 py-3 rounded-lg border border-gray-200 text-base outline-none"
          />
          <span className="text-base text-gray-500">件</span>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-orange hover:bg-orange-dark disabled:bg-gray-200 text-white font-bold py-3 px-6 rounded-lg text-base transition-all"
          >
            {generating ? "生成中..." : "生成"}
          </button>
        </div>

        {generatedCodes.length > 0 && (
          <div className="mt-5 bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-3">生成されたコード:</p>
            <div className="flex flex-wrap gap-2">
              {generatedCodes.map((code) => (
                <span key={code} className="text-sm bg-white px-3 py-1.5 rounded border border-gray-200 font-mono">
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <h3 className="font-semibold text-lg mb-4">招待コード一覧 ({total}件)</h3>
      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-4 font-medium text-gray-500">コード</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">発行者</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">使用者</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">状態</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">作成日</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((inv) => (
              <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-mono font-medium">{inv.code}</td>
                <td className="px-6 py-4 text-gray-500">{inv.generator?.nickname || "-"}</td>
                <td className="px-6 py-4 text-gray-500">{inv.consumer?.nickname || "-"}</td>
                <td className="px-6 py-4">
                  {inv.used_at ? (
                    <span className="text-sm bg-gray-50 text-gray-500 px-3 py-1 rounded-full">使用済</span>
                  ) : inv.is_active ? (
                    <span className="text-sm bg-green-50 text-green-500 px-3 py-1 rounded-full">有効</span>
                  ) : (
                    <span className="text-sm bg-red-50 text-red-500 px-3 py-1 rounded-full">無効</span>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-400">
                  {new Date(inv.created_at).toLocaleDateString("ja-JP")}
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
    </div>
  );
}
