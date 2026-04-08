"use client";

import { useEffect, useState, useCallback } from "react";
import type { AreaOption } from "@/types";
import { AREA_LABELS } from "@/types/constants";

interface WaitingRequest {
  request_id: string;
  user_id: string;
  user_nickname: string;
  user_avatar_emoji: string;
  area: string;
  available_dates: string[];
  status: string;
  created_at: string;
}

interface TwoPair {
  request_a: {
    request_id: string;
    user_id: string;
    user_nickname: string;
    user_avatar_emoji: string;
    status: string;
  };
  request_b: {
    request_id: string;
    user_id: string;
    user_nickname: string;
    user_avatar_emoji: string;
    status: string;
  } | null;
  area: string;
  common_dates: string[];
  created_at: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00+09:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${["日", "月", "火", "水", "木", "金", "土"][d.getDay()]})`;
}

function TwoPersonStatusBadge({ status }: { status: string }) {
  if (status === "two_person_accepted") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">承諾済</span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600 font-medium">未返答</span>
  );
}

export default function AdminWaitingPage() {
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);
  const [twoPairs, setTwoPairs] = useState<TwoPair[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/waiting");
      const data = await res.json();
      setWaiting(data.waiting || []);
      setTwoPairs(data.two_pairs || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-8">マッチング待機中</h1>
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">マッチング待機中</h1>
        <button
          onClick={fetchData}
          className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          更新
        </button>
      </div>

      {/* 2人マッチ提案中 */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">2人マッチ提案中</h2>
          <span className="text-sm px-3 py-1 rounded-full bg-orange-50 text-orange-500 font-medium">
            {twoPairs.length}組
          </span>
        </div>

        {twoPairs.length === 0 ? (
          <p className="text-gray-400 text-sm">該当なし</p>
        ) : (
          <div className="grid gap-4">
            {twoPairs.map((pair, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex flex-wrap items-start gap-6">
                  {/* ユーザーA */}
                  <div className="flex items-center gap-3 min-w-[140px]">
                    <span className="text-3xl">{pair.request_a.user_avatar_emoji || "👤"}</span>
                    <div>
                      <p className="font-medium text-gray-800">{pair.request_a.user_nickname || "未設定"}</p>
                      <TwoPersonStatusBadge status={pair.request_a.status} />
                    </div>
                  </div>

                  <div className="flex items-center text-gray-300 text-2xl self-center">⇔</div>

                  {/* ユーザーB */}
                  {pair.request_b ? (
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <span className="text-3xl">{pair.request_b.user_avatar_emoji || "👤"}</span>
                      <div>
                        <p className="font-medium text-gray-800">{pair.request_b.user_nickname || "未設定"}</p>
                        <TwoPersonStatusBadge status={pair.request_b.status} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <span className="text-3xl text-gray-300">👤</span>
                      <p className="text-sm text-gray-400">相手情報なし</p>
                    </div>
                  )}

                  {/* エリア・日程 */}
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm text-gray-500 mb-1">
                      <span className="font-medium text-gray-700">
                        {AREA_LABELS[pair.area as AreaOption] || pair.area}
                      </span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {pair.common_dates.map((d) => (
                        <span key={d} className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-600">
                          {formatDate(d)}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      申請: {new Date(pair.created_at).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3人マッチ待機中 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">3人マッチ待機中</h2>
          <span className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
            {waiting.length}人
          </span>
        </div>

        {waiting.length === 0 ? (
          <p className="text-gray-400 text-sm">該当なし</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-base">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-4 font-medium text-gray-500">ユーザー</th>
                  <th className="text-left px-6 py-4 font-medium text-gray-500">エリア</th>
                  <th className="text-left px-6 py-4 font-medium text-gray-500">希望日程</th>
                  <th className="text-left px-6 py-4 font-medium text-gray-500">申請日</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((req) => (
                  <tr key={req.request_id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{req.user_avatar_emoji || "👤"}</span>
                        <span className="font-medium text-gray-800">{req.user_nickname || "未設定"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {AREA_LABELS[req.area as AreaOption] || req.area}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {req.available_dates.map((d) => (
                          <span key={d} className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-600">
                            {formatDate(d)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {new Date(req.created_at).toLocaleDateString("ja-JP")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
