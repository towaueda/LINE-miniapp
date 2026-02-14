"use client";

import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { useEffect } from "react";

export default function Home() {
  const { isReady, user, login } = useLiff();
  const router = useRouter();

  useEffect(() => {
    if (isReady && user?.isLoggedIn && user.nickname) {
      router.push("/matching");
    }
  }, [isReady, user?.isLoggedIn, user?.nickname, router]);

  const handleLogin = () => {
    login();
    router.push("/profile");
  };

  return (
    <div className="min-h-[calc(100dvh-52px)] flex flex-col bg-white">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-4">
        <div className="animate-fade-in text-center">
          <div className="text-6xl mb-4">🔺</div>
          <h1 className="text-3xl font-bold mb-2">
            <span className="text-orange">Tri</span>
            <span className="text-foreground">angle</span>
          </h1>
          <p className="text-gray-500 text-sm mb-8">
            3人1組の、新しいランチ体験
          </p>
        </div>

        {/* Features */}
        <div className="w-full max-w-sm space-y-3 animate-slide-up mb-8">
          <FeatureCard
            emoji="👥"
            title="3人1組だから安心"
            desc="1対1じゃないから気軽に参加できる"
          />
          <FeatureCard
            emoji="🍽️"
            title="ランチ限定"
            desc="お昼休みの1時間で気軽に交流"
          />
          <FeatureCard
            emoji="✅"
            title="審査制で安全"
            desc="招待制＆レビュー制度で質を担保"
          />
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          className="w-full max-w-sm bg-line hover:bg-line-dark text-white font-bold py-3.5 px-6 rounded-xl text-base transition-all active:scale-[0.98] shadow-lg shadow-line/20"
        >
          LINEではじめる
        </button>
        <p className="text-[11px] text-gray-400 mt-3 text-center">
          ログインすることで利用規約に同意したとみなします
        </p>
      </div>
    </div>
  );
}

function FeatureCard({ emoji, title, desc }: { emoji: string; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3.5">
      <span className="text-2xl">{emoji}</span>
      <div>
        <p className="font-semibold text-sm text-foreground">{title}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
    </div>
  );
}
