"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { AGE_OPTIONS, AREA_LABELS, AreaOption, JOB_OPTIONS } from "@/types";
import { apiFetch } from "@/lib/api";

export default function ProfilePage() {
  const { user, setUser, dbUser, setDbUser, isLiffMode } = useLiff();
  const router = useRouter();

  const [nickname, setNickname] = useState("");
  const [ageGroup, setAgeGroup] = useState<string>("27-28");
  const [area, setArea] = useState<string>("");
  const [job, setJob] = useState<string>("");
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
      if (user.ageGroup) setAgeGroup(user.ageGroup);
      if (user.area) setArea(user.area);
      if (user.job) setJob(user.job);
      if (user.bio) setBio(user.bio);
    }
  }, [user, router]);

  const isValid = nickname.trim() && area && job;

  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!user || !isValid) return;
    setSaving(true);

    const updatedUser = {
      ...user,
      nickname: nickname.trim(),
      ageGroup: ageGroup as "24-26" | "27-28" | "29-30",
      area,
      job,
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
            ageGroup,
            area,
            job,
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

        {/* Age Group */}
        <Field label="年齢層" required>
          <div className="flex gap-2">
            {AGE_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                selected={ageGroup === opt.value}
                onClick={() => setAgeGroup(opt.value)}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>
        </Field>

        {/* Area */}
        <Field label="エリア" required>
          <div className="grid grid-cols-2 gap-2">
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

        {/* Job */}
        <Field label="職種" required>
          <div className="flex flex-wrap gap-2">
            {JOB_OPTIONS.map((opt) => (
              <ChipButton
                key={opt.value}
                selected={job === opt.value}
                onClick={() => setJob(opt.value)}
              >
                {opt.label}
              </ChipButton>
            ))}
          </div>
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
