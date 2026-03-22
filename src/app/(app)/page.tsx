"use client";

import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { getLiff } from "@/lib/liff";
import { useEffect, useState, useRef } from "react";

const PENDING_PROFILE_KEY = "triangle_pending_profile";

export default function Home() {
  const { isReady, user, login, isLiffMode, setDbUser, dbUser } = useLiff();
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [validating, setValidating] = useState(false);

  const [openModal, setOpenModal] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (isReady && user?.isLoggedIn && user.nickname) {
      const pendingProfile = sessionStorage.getItem(PENDING_PROFILE_KEY);
      if (pendingProfile) {
        sessionStorage.removeItem(PENDING_PROFILE_KEY);
        router.push("/profile");
      } else if (dbUser?.is_approved) {
        router.push("/matching");
      }
    }
  }, [isReady, user?.isLoggedIn, user?.nickname, dbUser?.is_approved, router]);

  const handleLogin = async () => {
    if (!agreed) return;
    if (!inviteCode.trim()) {
      setInviteError("招待コードを入力してください");
      return;
    }

    setValidating(true);
    setInviteError("");

    try {
      const res = await fetch("/api/invites/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode.trim() }),
      });
      const data = await res.json();

      if (data.error || !data.valid) {
        if (!res.ok) {
          console.warn("Invite validation API unavailable, skipping");
        } else {
          setInviteError("無効な招待コードです");
          setValidating(false);
          return;
        }
      }
    } catch {
      console.warn("Invite validation API unreachable, skipping");
    }

    sessionStorage.setItem("triangle_invite_code", inviteCode.trim());
    sessionStorage.setItem(PENDING_PROFILE_KEY, "1");

    const liffInstance = getLiff();
    const accessToken = liffInstance?.getAccessToken() ?? null;
    const alreadyLoggedIn =
      isLiffMode &&
      liffInstance &&
      !!accessToken &&
      (liffInstance.isInClient() || liffInstance.isLoggedIn());

    if (alreadyLoggedIn) {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, inviteCode: inviteCode.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          setDbUser(data.user);
          sessionStorage.removeItem("triangle_invite_code");
        }
      } catch (e) {
        console.error("Login with invite code failed:", e);
      }
      setValidating(false);
      router.push("/profile");
    } else {
      setValidating(false);
      if (liffInstance) {
        liffInstance.login();
      } else {
        login();
      }
    }
  };

  const canLogin = agreed && inviteCode.trim().length > 0 && !validating;

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

        {/* Invite Code Input */}
        <div className="w-full max-w-sm mb-4">
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => {
              setInviteCode(e.target.value);
              setInviteError("");
            }}
            placeholder="招待コードを入力"
            className="w-full px-4 py-3 rounded-xl border-[1.5px] border-gray-200 text-sm outline-none transition-colors focus:border-orange bg-white text-center tracking-wider"
          />
          {inviteError ? (
            <p className="text-xs text-red-500 mt-1.5 text-center">{inviteError}</p>
          ) : null}
        </div>

        {/* Terms Agreement */}
        <div className="w-full max-w-sm mb-4 text-center">
          {agreed ? (
            <p className="text-xs text-green-600 font-medium">
              ✓ 利用規約・プライバシーポリシーに同意済み
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setOpenModal(true)}
              className="text-xs text-gray-500"
            >
              <span className="text-orange underline underline-offset-2">
                利用規約・プライバシーポリシー
              </span>
              をご確認のうえ同意してください
            </button>
          )}
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={!canLogin}
          className="w-full max-w-sm bg-line hover:bg-line-dark disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl text-base transition-all active:scale-[0.98] shadow-lg shadow-line/20 disabled:shadow-none"
        >
          {validating ? "確認中..." : "LINEではじめる"}
        </button>
      </div>

      {/* Modal */}
      {openModal && (
        <DocumentModal
          onClose={() => setOpenModal(false)}
          onAgree={() => {
            setAgreed(true);
            setOpenModal(false);
          }}
        />
      )}
    </div>
  );
}

function FeatureCard({
  emoji,
  title,
  desc,
}: {
  emoji: string;
  title: string;
  desc: string;
}) {
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

function DocumentModal({
  onClose,
  onAgree,
}: {
  onClose: () => void;
  onAgree: () => void;
}) {
  const [reachedBottom, setReachedBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 16;
    if (atBottom) setReachedBottom(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-lg bg-white rounded-t-2xl flex flex-col max-h-[85dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-base text-foreground">利用規約・プライバシーポリシー</h2>
          <button
            onClick={onClose}
            className="text-gray-400 text-xl leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Scroll hint */}
        {!reachedBottom && (
          <p className="text-[11px] text-gray-400 text-center py-1.5 bg-gray-50 flex-shrink-0">
            最後までスクロールすると同意できます
          </p>
        )}

        {/* Content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-700 leading-relaxed space-y-4"
        >
          <h3 className="font-bold text-base text-foreground">利用規約</h3>
          <TermsContent />
          <div className="border-t border-gray-200 pt-4">
            <h3 className="font-bold text-base text-foreground mb-4">プライバシーポリシー</h3>
            <PrivacyContent />
          </div>
          <div className="h-4" />
        </div>

        {/* Footer Button */}
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={onAgree}
            disabled={!reachedBottom}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all bg-orange disabled:bg-gray-200 disabled:text-gray-400 text-white disabled:cursor-not-allowed"
          >
            {reachedBottom ? "同意して閉じる" : "最後までスクロールしてください"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TermsContent() {
  return (
    <>
      <p className="text-xs text-gray-400">最終更新日：2026年3月19日</p>

      <section>
        <h3 className="font-bold text-foreground mb-1">第1条（目的）</h3>
        <p>
          本利用規約（以下「本規約」）は、Triangle（以下「本サービス」）の利用条件を定めるものです。ユーザーは本規約に同意のうえ、本サービスをご利用ください。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">第2条（サービス内容）</h3>
        <p>
          本サービスは、LINEアカウントを利用した招待制のランチマッチングサービスです。同じエリア・日程を希望するユーザー3人をグループとしてマッチングし、ランチの機会を提供します。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">第3条（利用資格）</h3>
        <p>本サービスは招待制です。有効な招待コードを保有し、LINEアカウントをお持ちの方のみご利用いただけます。</p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">第4条（グループ内での情報共有）</h3>
        <p>
          マッチング成立後、同じグループのメンバーに対してニックネーム・エリア・業種・自己紹介などの登録情報が開示されます。個人を特定できる情報（氏名・連絡先・会社名等）の共有はシステム上行いません。ただし、ユーザー自身がチャット内でそれらを開示した場合の責任はユーザー本人に帰属します。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">第5条（禁止事項）</h3>
        <p>以下の行為を禁止します。</p>
        <ul className="list-disc pl-4 mt-1 space-y-1">
          <li>他のユーザーへのなりすまし</li>
          <li>誹謗中傷・ハラスメント・差別的発言</li>
          <li>確定したランチの無断キャンセル</li>
          <li>勧誘・マルチ商法・営業目的での利用</li>
          <li>本サービスの運営を妨害する行為</li>
          <li>その他、運営が不適切と判断する行為</li>
        </ul>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">第6条（アカウント停止）</h3>
        <p>
          禁止事項に該当する行為が確認された場合、またはユーザーからの報告に基づき運営が必要と判断した場合、事前の通知なくアカウントを停止することがあります。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">第7条（免責事項）</h3>
        <p>
          本サービスはマッチングの機会を提供するものであり、ランチの内容・安全性・ユーザー間のトラブルについて運営は責任を負いません。ユーザー同士のトラブルはユーザー間で解決してください。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">第8条（規約の変更）</h3>
        <p>
          運営は必要に応じて本規約を変更できます。変更後もサービスを利用した場合、変更後の規約に同意したものとみなします。
        </p>
      </section>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="text-xs text-gray-400">最終更新日：2026年3月19日</p>

      <section>
        <h3 className="font-bold text-foreground mb-1">1. 収集する情報</h3>
        <p>本サービスでは以下の情報を収集します。</p>
        <ul className="list-disc pl-4 mt-1 space-y-1">
          <li>LINEアカウント情報（ユーザーID・アクセストークン）</li>
          <li>ユーザーが入力したプロフィール情報（ニックネーム・生年・エリア・業種・会社・自己紹介）</li>
          <li>マッチング申請情報（希望日程・エリア）</li>
          <li>チャットメッセージ</li>
          <li>レビュー・評価内容</li>
          <li>招待コードの利用履歴</li>
        </ul>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">2. 利用目的</h3>
        <p>収集した情報は以下の目的で利用します。</p>
        <ul className="list-disc pl-4 mt-1 space-y-1">
          <li>ユーザーの認証・本人確認</li>
          <li>マッチングサービスの提供</li>
          <li>グループ内でのユーザー情報の表示</li>
          <li>不正利用の防止・サービス品質の維持</li>
          <li>サービスの改善・分析</li>
        </ul>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">3. 第三者への提供</h3>
        <p>
          収集した個人情報は、法令に基づく場合を除き、ユーザーの同意なく第三者に提供しません。ただし、マッチングしたグループメンバーへのプロフィール情報の開示はサービスの性質上発生します。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">4. データの保管</h3>
        <p>
          収集した情報はFirebase（Google Cloud）上に保管されます。データはサービス提供に必要な期間保管し、不要になった時点で適切に削除します。チャットメッセージはマッチング日当日の23:59以降は閲覧できなくなります。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">5. セキュリティ</h3>
        <p>
          個人情報の漏洩・滅失・毀損を防ぐため、適切なセキュリティ対策を講じます。ただし、完全な安全性を保証するものではありません。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">6. プライバシーポリシーの変更</h3>
        <p>
          本ポリシーは必要に応じて変更することがあります。変更後にサービスを利用した場合、変更後のポリシーに同意したものとみなします。
        </p>
      </section>

      <section>
        <h3 className="font-bold text-foreground mb-1">7. お問い合わせ</h3>
        <p>
          個人情報の取り扱いに関するお問い合わせは、サービス内のお問い合わせ窓口までご連絡ください。
        </p>
      </section>
    </>
  );
}
