"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import type { AreaOption, MatchGroup } from "@/types";
import { AREA_LABELS, INDUSTRY_LABEL_MAP } from "@/types/constants";
import { apiFetch } from "@/lib/api";

const MATCH_STORAGE_KEY = "triangle_match";

interface ApiGroup {
  id: string; area: string; date: string; time: string; restaurant_name: string; status: string;
}
interface ApiMember {
  id: string; nickname: string; birth_year: number; industry: string; avatar_emoji: string; bio: string;
}

function toMatchGroup(group: ApiGroup, members: ApiMember[]): MatchGroup {
  return {
    id: group.id,
    members: members.map((m) => ({
      id: m.id,
      nickname: m.nickname || "",
      birthYear: m.birth_year || 0,
      industry: m.industry || "",
      avatarEmoji: m.avatar_emoji || "😊",
      bio: m.bio || "",
    })),
    date: group.date,
    time: group.time,
    area: AREA_LABELS[group.area as AreaOption] || group.area,
    restaurant: group.restaurant_name,
    status: group.status as "pending" | "confirmed" | "completed",
  };
}

function getNextThursdays(): { label: string; value: string }[] {
  const dates: { label: string; value: string }[] = [];
  const today = new Date();

  for (let i = 1; i <= 28; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (d.getDay() === 4) {
      // Thursday
      const month = d.getMonth() + 1;
      const day = d.getDate();
      dates.push({
        label: `${month}/${day}(木)`,
        value: d.toISOString().split("T")[0],
      });
    }
  }
  return dates;
}

function getIndustryLabel(value: string): string {
  return INDUSTRY_LABEL_MAP.get(value) || value;
}

export default function MatchingPage() {
  const { user, isReady, isLiffMode, dbUser } = useLiff();
  const router = useRouter();
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [matchResult, setMatchResult] = useState<MatchGroup | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasPendingReview, setHasPendingReview] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [isTwoPersonOffered, setIsTwoPersonOffered] = useState(false);
  const [twoPersonDates, setTwoPersonDates] = useState<string[]>([]);
  const [twoPersonRequestId, setTwoPersonRequestId] = useState<string>('');
  const [isNoMatch, setIsNoMatch] = useState(false);
  const [dates] = useState(getNextThursdays);

  const userLoggedIn = user?.isLoggedIn;
  const userArea = user?.area;
  const isProfileComplete = !!(user?.nickname && user?.area && user?.industry);

  // Check existing match status on mount
  const checkStatus = useCallback(async () => {
    if (!isLiffMode || !dbUser) return;
    try {
      const data = await apiFetch<{
        status: string;
        hasPendingReview?: boolean;
        group?: ApiGroup;
        members?: ApiMember[];
        requestId?: string;
        proposedDates?: string[];
      }>("/api/matching/status");

      if (data.hasPendingReview) {
        setHasPendingReview(true);
      }

      if (data.status === "matched" && data.group && data.members) {
        const match = toMatchGroup(data.group, data.members);
        setMatchResult(match);
        localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(match));
      } else if (data.status === "two_person_offered") {
        setIsTwoPersonOffered(true);
        setTwoPersonDates(data.proposedDates || []);
        setTwoPersonRequestId(data.requestId || '');
      } else if (data.status === "no_match") {
        setIsNoMatch(true);
      } else if (data.status === "waiting") {
        localStorage.removeItem(MATCH_STORAGE_KEY);
        setIsWaiting(true);
      } else {
        localStorage.removeItem(MATCH_STORAGE_KEY);
      }
    } catch (e) {
      console.error("Failed to check status:", e);
    }
  }, [isLiffMode, dbUser]);

  useEffect(() => {
    if (!isReady) return;

    if (!userLoggedIn) {
      router.push("/");
      return;
    }
    if (userArea) setSelectedArea(userArea);

    if (isLiffMode && dbUser) {
      checkStatus();
    }
  }, [isReady, userLoggedIn, userArea, router, isLiffMode, dbUser, checkStatus]);

  const toggleDate = (val: string) => {
    setSelectedDates((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val]
    );
  };

  const handleSearch = async () => {
    if (!selectedDates.length || !selectedArea || !user) return;
    setIsSearching(true);
    setMatchError(null);
    setIsNoMatch(false);
    setIsTwoPersonOffered(false);

    try {
      const data = await apiFetch<{
        status: string;
        error?: string;
        group?: ApiGroup;
        members?: ApiMember[];
      }>("/api/matching/request", {
        method: "POST",
        body: JSON.stringify({ area: selectedArea, dates: selectedDates }),
      });

      if (data.status === "matched" && data.group && data.members) {
        const match = toMatchGroup(data.group, data.members);
        setMatchResult(match);
        localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(match));
      } else {
        setIsWaiting(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('レビュー未完了')) {
        setHasPendingReview(true);
      } else {
        setMatchError('マッチングリクエストに失敗しました。もう一度お試しください。');
      }
    }
    setIsSearching(false);
  };

  const handleTwoPersonResponse = async (action: 'accept' | 'decline') => {
    try {
      const data = await apiFetch<{ status: string; group?: ApiGroup; members?: ApiMember[] }>(
        '/api/matching/two-person-response',
        { method: 'POST', body: JSON.stringify({ action }) }
      );
      if (data.status === 'matched' && data.group && data.members) {
        setIsTwoPersonOffered(false);
        const match = toMatchGroup(data.group, data.members);
        setMatchResult(match);
        localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(match));
      } else if (data.status === 'waiting_for_partner') {
        setIsTwoPersonOffered(false);
        setIsWaiting(true);
      } else {
        setIsTwoPersonOffered(false);
        setIsNoMatch(true);
      }
    } catch (e) {
      console.error('Two person response failed:', e);
    }
  };

  const handleCancel = async () => {
    if (isLiffMode && dbUser) {
      try {
        await apiFetch("/api/matching/cancel", { method: "POST" });
      } catch (e) {
        console.error("Cancel failed:", e);
      }
    }
    setIsWaiting(false);
    setIsTwoPersonOffered(false);
    setIsNoMatch(false);
  };

  if (!userLoggedIn) return null;

  return (
    <div className="px-4 py-6">
      {/* Profile Incomplete Banner */}
      {!isProfileComplete ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-red-600 mb-1">プロフィール未完成</p>
          <p className="text-xs text-gray-600 mb-3">
            ニックネーム・エリア・業種を設定してからマッチングをリクエストしてください。
          </p>
          <button
            onClick={() => router.push("/profile")}
            className="bg-red-500 text-white text-xs font-bold py-2 px-4 rounded-lg"
          >
            プロフィールを設定する
          </button>
        </div>
      ) : null}

      {/* Pending Review Banner */}
      {hasPendingReview ? (
        <div className="bg-orange/10 border border-orange/30 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold text-orange mb-1">レビュー未完了</p>
          <p className="text-xs text-gray-600 mb-3">
            前回のマッチングのレビューを完了してからマッチングをリクエストしてください。
          </p>
          <button
            onClick={() => router.push("/review")}
            className="bg-orange text-white text-xs font-bold py-2 px-4 rounded-lg"
          >
            レビューページへ
          </button>
        </div>
      ) : null}

      {matchResult ? (
        <MatchResultView match={matchResult} userId={user!.id} onReset={() => {
          setMatchResult(null);
          localStorage.removeItem(MATCH_STORAGE_KEY);
          setIsWaiting(false);
          setIsTwoPersonOffered(false);
          setIsNoMatch(false);
        }} />
      ) : isTwoPersonOffered ? (
        <TwoPersonOfferView
          dates={twoPersonDates}
          requestId={twoPersonRequestId}
          onAccept={() => handleTwoPersonResponse('accept')}
          onDecline={() => handleTwoPersonResponse('decline')}
        />
      ) : isNoMatch ? (
        <NoMatchView onReset={() => { setIsNoMatch(false); }} />
      ) : isWaiting ? (
        <WaitingView onCancel={handleCancel} />
      ) : (
        <div className="animate-fade-in">
          <h2 className="text-xl font-bold mb-1">マッチングを探す</h2>
          <p className="text-sm text-gray-500 mb-6">
            参加したい木曜日とエリアを選んでください
          </p>

          {/* Date Selection (Thursdays only) */}
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-3">
              日程を選択（毎週木曜） <span className="text-orange text-xs">複数OK</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {dates.map((d) => (
                <button
                  key={d.value}
                  onClick={() => toggleDate(d.value)}
                  disabled={!isProfileComplete || hasPendingReview}
                  className={`py-2.5 rounded-lg text-xs font-medium transition-all border ${
                    selectedDates.includes(d.value)
                      ? "bg-orange text-white border-orange"
                      : "bg-white text-gray-600 border-gray-200"
                  } disabled:opacity-50`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">時間: 12:00〜13:00 固定</p>
          </div>

          {/* Area Selection */}
          <div className="mb-8">
            <label className="block text-sm font-semibold mb-3">エリア</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(AREA_LABELS) as [AreaOption, string][]).map(
                ([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedArea(key)}
                    disabled={!isProfileComplete || hasPendingReview}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-all border ${
                      selectedArea === key
                        ? "bg-orange text-white border-orange"
                        : "bg-white text-gray-600 border-gray-200"
                    } disabled:opacity-50`}
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Search Button */}
          <button
            onClick={handleSearch}
            disabled={!isProfileComplete || !selectedDates.length || !selectedArea || isSearching || hasPendingReview}
            className="w-full bg-line hover:bg-line-dark disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
          >
            {isSearching ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                マッチング中...
              </span>
            ) : (
              "マッチングを探す"
            )}
          </button>

          {/* Error Message */}
          {matchError ? (
            <p className="text-xs text-red-500 mt-2 text-center">{matchError}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function WaitingView({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="animate-fade-in text-center py-12">
      <div className="text-5xl mb-4">🔍</div>
      <h2 className="text-xl font-bold mb-2">マッチング待ち</h2>
      <p className="text-sm text-gray-500 mb-8">
        同じエリア・日程の仲間を探しています。<br />
        3人揃ったらお知らせします！
      </p>
      <div className="flex justify-center mb-8">
        <span className="animate-spin inline-block w-8 h-8 border-3 border-orange border-t-transparent rounded-full" />
      </div>
      <button
        onClick={onCancel}
        className="text-sm text-gray-400 underline"
      >
        キャンセルする
      </button>
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [, month, day] = dateStr.split('-').map(Number);
  const d = new Date(dateStr + 'T00:00:00');
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayName = dayNames[d.getDay()];
  return `${month}/${day}(${dayName})`;
}

function TwoPersonOfferView({
  dates,
  requestId,
  onAccept,
  onDecline,
}: {
  dates: string[];
  requestId: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  void requestId;
  return (
    <div className="animate-fade-in">
      <div className="text-center mb-6">
        <div className="text-5xl mb-4">🍽️</div>
        <h2 className="text-xl font-bold mb-2">2人でランチしませんか？</h2>
        <p className="text-sm text-gray-500">
          3人が揃わなかったため、2人でのランチをご提案します。
        </p>
      </div>

      {dates.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-6 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-3">提案日程</p>
          <div className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <span
                key={d}
                className="bg-orange/10 text-orange text-sm font-medium px-3 py-1.5 rounded-lg"
              >
                {formatDateLabel(d)}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <button
        onClick={onAccept}
        className="w-full bg-orange hover:bg-orange/90 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] mb-3"
      >
        はい、2人でも行きます！
      </button>
      <button
        onClick={onDecline}
        className="w-full bg-white text-gray-500 font-medium py-3 rounded-xl border border-gray-200 text-sm transition-all active:scale-[0.98]"
      >
        別の日程を探す
      </button>
    </div>
  );
}

function NoMatchView({ onReset }: { onReset: () => void }) {
  return (
    <div className="animate-fade-in text-center py-12">
      <div className="text-5xl mb-4">😔</div>
      <h2 className="text-xl font-bold mb-2">マッチングなし</h2>
      <p className="text-sm text-gray-500 mb-8">
        今回はマッチングできませんでした。別の日程で再度お試しください。
      </p>
      <button
        onClick={onReset}
        className="w-full bg-line hover:bg-line-dark text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
      >
        別の日程で探す
      </button>
    </div>
  );
}

function MatchResultView({
  match,
  userId,
  onReset,
}: {
  match: MatchGroup;
  userId: string;
  onReset: () => void;
}) {
  const router = useRouter();
  const otherMembers = useMemo(
    () => match.members.filter((m) => m.id !== userId),
    [match.members, userId]
  );

  return (
    <div className="animate-slide-up">
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🎉</div>
        <h2 className="text-xl font-bold">マッチング成立！</h2>
        <p className="text-sm text-gray-500 mt-1">
          3人のランチグループが見つかりました
        </p>
      </div>

      {/* Match Info */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📍</span>
          <div>
            <p className="font-semibold text-sm">{match.restaurant}</p>
            <p className="text-xs text-gray-500">{match.area}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg">📅</span>
          <p className="text-sm">
            {match.date} {match.time}〜13:00
          </p>
        </div>
      </div>

      {/* Members */}
      <div className="space-y-3 mb-6">
        {otherMembers.map((member) => (
          <div
            key={member.id}
            className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl">{member.avatarEmoji}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">{member.nickname}</span>
                  {member.birthYear > 0 && (
                    <span className="text-[11px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                      {member.birthYear}年生
                    </span>
                  )}
                </div>
                <p className="text-xs text-orange mb-1">{getIndustryLabel(member.industry)}</p>
                <p className="text-xs text-gray-500">{member.bio}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <button
        onClick={() => router.push("/chat")}
        className="w-full bg-line hover:bg-line-dark text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98] mb-3"
      >
        グループチャットへ
      </button>
      <button
        onClick={onReset}
        className="w-full bg-white text-gray-500 font-medium py-3 rounded-xl border border-gray-200 text-sm"
      >
        別の日程で探す
      </button>
    </div>
  );
}
