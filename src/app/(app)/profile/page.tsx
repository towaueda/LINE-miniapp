"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import type { AreaOption } from "@/types";
import { AGE_OPTIONS, AREA_LABELS, INDUSTRY_OPTIONS } from "@/types/constants";
import { apiFetch } from "@/lib/api";

const currentYear = new Date().getFullYear();

export default function ProfilePage() {
  const { user, setUser, dbUser, setDbUser, isLiffMode } = useLiff();
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState<number>(currentYear - 25);
  const [area, setArea] = useState<string>("");
  const [industry, setIndustry] = useState<string>("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const initialized = useRef(false);

  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    if (!initialized.current) {
      initialized.current = true;
      if (user.nickname) setNickname(user.nickname);
      if (user.birthYear) setBirthYear(user.birthYear);
      if (user.area) setArea(user.area);
      if (user.industry) setIndustry(user.industry);
      if (user.company) setCompany(user.company);
      if (user.bio) setBio(user.bio);
    }
  }, [user, router]);

  const isValid = nickname.trim() && area && industry;

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    setSaving(true);

    const updatedUser = {
      ...user,
      nickname: nickname.trim(),
      birthYear,
      area,
      industry,
      company: company.trim(),
      bio: bio.trim(),
    };
    setUser(updatedUser);

    // Save to backend if in LIFF mode
    if (isLiffMode && dbUser) {
      try {
        const data = await apiFetch<{ user: import("@/types").DbUser }>("/api/users/profile", {
          method: "PUT",
          body: JSON.stringify({
            nickname: nickname.trim(),
            birthYear,
            area,
            industry,
            company: company.trim(),
            bio: bio.trim(),
            avatarEmoji: user.avatarEmoji,
          }),
        });
        setDbUser(data.user);
      } catch (e) {
        console.error("Failed to save profile:", e);
      }
    }

    setSaving(false);
    router.push("/matching");
  };

  if (!user) return null;

  return (
    <div className="px-4 py-6 animate-fade-in">
      <h2 className="text-xl font-bold mb-1">プロフィール登録</h2>
      <p className="text-sm text-gray-500 mb-6">
        マッチングに使う情報を入力してください
      </p>

      <div className="space-y-5">
        {/* Nickname */}
        <Field label="ニックネーム" required>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="例：たくみ"
            maxLength={10}
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-gray-200 text-sm outline-none transition-colors focus:border-orange bg-white"
          />
        </Field>

        {/* Age */}
        <Field label="年齢" required>
          <select
            value={currentYear - birthYear}
            onChange={(e) => setBirthYear(currentYear - Number(e.target.value))}
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-gray-200 text-sm outline-none transition-colors focus:border-orange bg-white"
          >
            {AGE_OPTIONS.map((age) => (
              <option key={age} value={age}>
                {age}歳
              </option>
            ))}
          </select>
        </Field>

        {/* Area */}
        <Field label="エリア" required>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(AREA_LABELS) as [AreaOption, string][]).map(
              ([key, label]) => (
                <ChipButton
                  key={key}
                  selected={area === key}
                  onClick={() => setArea(key)}
                >
                  {label}
                </ChipButton>
              )
            )}
          </div>
        </Field>

        {/* Industry */}
        <Field label="業種" required>
          <div className="flex flex-wrap gap-2">
            {INDUSTRY_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                selected={industry === opt.value}
                onClick={() => setIndustry(opt.value)}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>
        </Field>

        {/* Company */}
        <Field label="会社名" optional>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="例：株式会社〇〇"
            maxLength={30}
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-gray-200 text-sm outline-none transition-colors focus:border-orange bg-white"
          />
        </Field>

        {/* Bio */}
        <Field label="自己紹介" optional>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="趣味や好きなものを書いてみましょう"
            maxLength={100}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-gray-200 text-sm outline-none transition-colors focus:border-orange bg-white resize-none"
          />
          <p className="text-right text-[11px] text-gray-400 mt-1">
            {bio.length}/100
          </p>
        </Field>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!isValid || saving}
        className="w-full mt-8 bg-orange hover:bg-orange-dark disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.98]"
      >
        {saving ? "保存中..." : "保存してマッチングへ"}
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-2">
        {label}
        {required && (
          <span className="text-orange text-xs ml-1">必須</span>
        )}
        {optional && (
          <span className="text-gray-400 text-xs ml-1">任意</span>
        )}
      </label>
      {children}
    </div>
  );
}

function ChipButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
        selected
          ? "bg-orange text-white border-orange"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}
