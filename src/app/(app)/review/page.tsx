"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import type { MatchGroup, Review } from "@/types";
import { apiFetch } from "@/lib/api";

const MATCH_KEY = "triangle_match";
const REVIEW_DONE_KEY = "triangle_review_done";
const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export default function ReviewPage() {
  const { user, isReady, isLiffMode, dbUser } = useLiff();
  const router = useRouter();
  const [match, setMatch] = useState<MatchGroup | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const userLoggedIn = user?.isLoggedIn;
  const userId = user?.id;
  const useApi = isLiffMode && !!dbUser;

  useEffect(() => {
    if (!isReady) return;

    if (!userLoggedIn || !userId) {
      router.push("/");
      return;
    }

    const done = localStorage.getItem(REVIEW_DONE_KEY);
    if (done) {
      setSubmitted(true);
      setInviteCode(done);
      return;
    }

    const storedMatch = localStorage.getItem(MATCH_KEY);
    if (!storedMatch) {
      router.push("/matching");
      return;
    }

    let parsed: MatchGroup;
    try {
      parsed = JSON.parse(storedMatch);
    } catch {
      localStorage.removeItem(MATCH_KEY);
      router.push("/matching");
      return;
    }
    setMatch(parsed);

    const others = parsed.members.filter((m) => m.id !== userId);
    setReviews(
      others.map((m) => ({
        targetId: m.id,
        targetName: m.nickname,
        communication: 0,
        punctuality: 0,
        meetAgain: 0,
        comment: "",
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, userLoggedIn, userId]);

  const memberMap = useMemo(
    () => (match ? new Map(match.members.map((m) => [m.id, m])) : new Map()),
    [match]
  );

  const updateReview = useCallback((idx: number, field: keyof Review, value: number | string) => {
    setReviews((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  }, []);

  const allRated = reviews.every(
    (r) => r.communication > 0 && r.punctuality > 0 && r.meetAgain > 0
  );

  const handleSubmit = async () => {
    if (!allRated || submitting) return;
    setSubmitting(true);

    if (useApi && match) {
      try {
        const data = await apiFetch<{ inviteCode: string }>("/api/reviews/submit", {
          method: "POST",
          body: JSON.stringify({
            groupId: match.id,
            reviews: reviews.map((r) => ({
              targetId: r.targetId,
              communication: r.communication,
              punctuality: r.punctuality,
              meetAgain: r.meetAgain,
              comment: r.comment,
            })),
          }),
        });
        setInviteCode(data.inviteCode);
        setSubmitted(true);
        localStorage.setItem(REVIEW_DONE_KEY, data.inviteCode);
      } catch (e) {
        console.error("Failed to submit reviews:", e);
      }
    } else {
      const code = `TRI-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      setInviteCode(code);
      setSubmitted(true);
      localStorage.setItem(REVIEW_DONE_KEY, code);
    }

    setSubmitting(false);
  };

  if (!userLoggedIn) return null;

  if (submitted) {
    return (
      <div className="px-4 py-6 animate-slide-up">
        <div className="text-center py-8">
          <div className="text-5xl mb-4">🎊</div>
          <h2 className="text-xl font-bold mb-2">レビュー完了！</h2>
          <p className="text-sm text-gray-500 mb-8">
            ご協力ありがとうございました！
            <br />
            高評価ユーザーとして招待コードを発行しました
          </p>

          <div className="bg-gradient-to-br from-orange/5 to-orange/10 rounded-2xl p-6 mb-6">
            <p className="text-xs text-gray-500 mb-2">あなたの招待コード</p>
            <p className="text-2xl font-bold text-orange tracking-wider">
              {inviteCode}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              友達に共有して一緒にTriangleを楽しもう！
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-left">
            <p className="text-sm font-semibold mb-2">次のステップ</p>
            <div className="space-y-2 text-xs text-gray-500">
              <p>1. 招待コードを友達にシェア</p>
              <p>2. 新しいマッチングを探す</p>
              <p>3. もっと多くの人と出会おう！</p>
            </div>
          </div>

          <button
            onClick={() => {
              localStorage.removeItem(MATCH_KEY);
              localStorage.removeItem("triangle_chat");
              localStorage.removeItem(REVIEW_DONE_KEY);
              router.push("/matching");
            }}
            className="w-full mt-6 bg-line hover:bg-line-dark text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
          >
            新しいマッチングを探す
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 animate-fade-in">
      <h2 className="text-xl font-bold mb-1">ランチレビュー</h2>
      <p className="text-sm text-gray-500 mb-6">
        一緒にランチした方への評価をお願いします
      </p>

      <div className="space-y-6">
        {reviews.map((review, idx) => {
          const member = memberMap.get(review.targetId);
          return (
            <div
              key={review.targetId}
              className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">
                  {member?.avatarEmoji || "👤"}
                </span>
                <div>
                  <span className="font-semibold">{review.targetName}</span>
                  {member?.birthYear != null && member.birthYear > 0 ? (
                    <span className="text-[11px] text-gray-400 ml-2">
                      {member.birthYear}年生
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4">
                <StarRating
                  label="話しやすさ"
                  value={review.communication}
                  onChange={(v) => updateReview(idx, "communication", v)}
                />
                <StarRating
                  label="時間厳守"
                  value={review.punctuality}
                  onChange={(v) => updateReview(idx, "punctuality", v)}
                />
                <StarRating
                  label="また会いたい度"
                  value={review.meetAgain}
                  onChange={(v) => updateReview(idx, "meetAgain", v)}
                />

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    コメント（任意）
                  </label>
                  <input
                    type="text"
                    value={review.comment}
                    onChange={(e) => updateReview(idx, "comment", e.target.value)}
                    placeholder="ひとことメッセージ"
                    maxLength={50}
                    className="w-full px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-1 focus:ring-orange/30"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!allRated || submitting}
        className="w-full mt-6 bg-orange hover:bg-orange-dark disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
      >
        {submitting ? "送信中..." : "レビューを送信"}
      </button>
    </div>
  );
}

function StarRating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <div className="flex gap-1">
        {STAR_VALUES.map((star) => (
          <button
            key={star}
            onClick={() => onChange(star)}
            className={`text-2xl transition-transform active:scale-110 ${
              star <= value ? "grayscale-0" : "grayscale opacity-30"
            }`}
          >
            ⭐
          </button>
        ))}
      </div>
    </div>
  );
}
