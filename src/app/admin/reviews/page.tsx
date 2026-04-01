"use client";

import { useEffect, useState, useCallback } from "react";

interface ReviewRow {
  id: string;
  communication: number;
  punctuality: number;
  meet_again: number;
  comment: string | null;
  created_at: string;
  reviewer: { nickname: string; avatar_emoji: string } | null;
  target: { nickname: string; avatar_emoji: string } | null;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchReviews = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    const res = await fetch(`/api/admin/reviews?${params}`);
    const data = await res.json();
    setReviews(data.reviews);
    setTotal(data.total);
  }, [page]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">レビュー監視</h1>
      <p className="text-base text-gray-400 mb-6">{total}件</p>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-base">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-4 font-medium text-gray-500">レビューア</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">対象</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">話しやすさ</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">時間厳守</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">また会いたい</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">コメント</th>
              <th className="text-left px-6 py-4 font-medium text-gray-500">日付</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  {r.reviewer?.avatar_emoji} {r.reviewer?.nickname || "?"}
                </td>
                <td className="px-6 py-4">
                  {r.target?.avatar_emoji} {r.target?.nickname || "?"}
                </td>
                <td className="px-6 py-4">
                  <Stars value={r.communication} />
                </td>
                <td className="px-6 py-4">
                  <Stars value={r.punctuality} />
                </td>
                <td className="px-6 py-4">
                  <Stars value={r.meet_again} />
                </td>
                <td className="px-6 py-4 text-gray-500 max-w-[280px] truncate">
                  {r.comment || "-"}
                </td>
                <td className="px-6 py-4 text-gray-400">
                  {new Date(r.created_at).toLocaleDateString("ja-JP")}
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

function Stars({ value }: { value: number }) {
  return (
    <span className="text-xs">
      {"⭐".repeat(value)}{"☆".repeat(5 - value)}
    </span>
  );
}
