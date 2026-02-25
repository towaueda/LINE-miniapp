"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { ChatMessage, MatchGroup } from "@/types";
import { generateMockChat } from "@/lib/mockData";
import { useRealtimeChat } from "@/hooks/useRealtimeChat";
import { apiFetch } from "@/lib/api";

const MATCH_KEY = "triangle_match";
const CHAT_KEY = "triangle_chat";

const MOCK_REPLIES = [
  "いいですね！👍",
  "了解です！",
  "楽しみ〜！",
  "OK！",
  "それいいですね！😊",
];

export default function ChatPage() {
  const { user, isReady, isLiffMode, dbUser } = useLiff();
  const router = useRouter();
  const [mockMessages, setMockMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [match, setMatch] = useState<MatchGroup | null>(null);
  const [noMatch, setNoMatch] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const userLoggedIn = user?.isLoggedIn;
  const userId = user?.id;
  const userNickname = user?.nickname;
  const hasProfile = !!user?.nickname;

  const useApi = isLiffMode && !!dbUser;
  const groupId = useApi ? match?.id || null : null;

  const { messages: realtimeMessages, sendMessage: realtimeSend } = useRealtimeChat(groupId);

  const messages = useApi ? realtimeMessages : mockMessages;

  useEffect(() => {
    if (!isReady) return;

    if (!userLoggedIn) {
      router.push("/");
      return;
    }

    const storedMatch = localStorage.getItem(MATCH_KEY);
    if (!storedMatch) {
      setNoMatch(true);
      return;
    }
    setNoMatch(false);
    setMatch(JSON.parse(storedMatch));

    if (!useApi) {
      const storedChat = localStorage.getItem(CHAT_KEY);
      if (storedChat) {
        setMockMessages(JSON.parse(storedChat));
      } else {
        const initial = generateMockChat();
        setMockMessages(initial);
        localStorage.setItem(CHAT_KEY, JSON.stringify(initial));
      }
    }
  }, [isReady, userLoggedIn, router, useApi]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: isFirstRender.current ? "instant" : "smooth",
    });
    isFirstRender.current = false;
  }, [messages]);

  const saveChat = useCallback((msgs: ChatMessage[]) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const memberMap = useMemo(
    () => (match ? new Map(match.members.map((m) => [m.id, m])) : new Map()),
    [match]
  );

  const headerInfo = useMemo(() => {
    if (!match || !userId) return { names: "", detail: "" };
    return {
      names: match.members
        .filter((m) => m.id !== userId)
        .map((m) => m.nickname)
        .join("・"),
      detail: `📍 ${match.restaurant} ・ ${match.date} ${match.time}`,
    };
  }, [match, userId]);

  const sendMessage = async () => {
    if (!input.trim() || !userId || !userNickname) return;

    if (useApi) {
      await realtimeSend(input.trim());
      setInput("");
    } else {
      const newMsg: ChatMessage = {
        id: `msg_user_${Date.now()}`,
        senderId: userId,
        senderName: userNickname,
        text: input.trim(),
        timestamp: new Date().toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      const updated = [...mockMessages, newMsg];
      setMockMessages(updated);
      saveChat(updated);
      setInput("");

      setTimeout(() => {
        const mockReply: ChatMessage = {
          id: `msg_mock_${Date.now()}`,
          senderId: "user_2",
          senderName: "ゆうき",
          text: MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)],
          timestamp: new Date().toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setMockMessages((prev) => {
          const withReply = [...prev, mockReply];
          saveChat(withReply);
          return withReply;
        });
      }, 1500);
    }
  };

  const handleComplete = async () => {
    if (useApi && match) {
      try {
        await apiFetch("/api/matching/complete", {
          method: "POST",
          body: JSON.stringify({ groupId: match.id }),
        });
      } catch (e) {
        console.error("Failed to complete:", e);
      }
    }
    router.push("/review");
  };

  if (!isReady || !userLoggedIn) return null;

  if (noMatch) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-52px-56px)] px-6">
        <div className="text-5xl mb-4">💬</div>
        <p className="text-base font-semibold text-gray-700 text-center mb-2">
          マッチしていません
        </p>
        <p className="text-sm text-gray-400 text-center mb-6">
          プロフィールを記入してマッチングを行ってください
        </p>
        <button
          onClick={() => router.push(hasProfile ? "/matching" : "/profile")}
          className="bg-line hover:bg-line-dark text-white font-bold py-3 px-8 rounded-xl transition-all active:scale-[0.98]"
        >
          {hasProfile ? "マッチングへ" : "プロフィールを記入する"}
        </button>
      </div>
    );
  }

  if (!match || !userId) return null;

  return (
    <div className="flex flex-col h-[calc(100dvh-52px-56px)]">
      {/* Chat Info Bar */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center justify-between shrink-0">
        <div>
          <p className="text-sm font-semibold">{headerInfo.names}</p>
          <p className="text-[11px] text-gray-400">{headerInfo.detail}</p>
        </div>
        <span className="text-[10px] text-orange bg-orange/10 px-2 py-1 rounded-full font-medium">
          期間限定
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50">
        {messages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="text-center">
                <span className="text-[11px] text-gray-400 bg-white px-3 py-1.5 rounded-full inline-block shadow-sm">
                  {msg.text}
                </span>
              </div>
            );
          }

          const isMe = msg.senderId === userId || (useApi && msg.senderId === dbUser?.id);
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"} gap-2`}
            >
              {!isMe && (
                <div className="shrink-0">
                  <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center text-sm">
                    {memberMap.get(msg.senderId)?.avatarEmoji || "👤"}
                  </div>
                </div>
              )}
              <div className={`max-w-[70%] ${isMe ? "order-first" : ""}`}>
                {!isMe && (
                  <p className="text-[11px] text-gray-400 mb-0.5 ml-1">
                    {msg.senderName}
                  </p>
                )}
                <div
                  className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? "bg-line text-white rounded-br-md"
                      : "bg-white text-foreground rounded-bl-md shadow-sm"
                  }`}
                >
                  {msg.text}
                </div>
                <p
                  className={`text-[10px] text-gray-300 mt-0.5 ${
                    isMe ? "text-right mr-1" : "ml-1"
                  }`}
                >
                  {msg.timestamp}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Lunch Complete Button */}
      <div className="bg-white border-t border-gray-100 px-4 py-2 shrink-0">
        <button
          onClick={handleComplete}
          className="w-full bg-orange/10 text-orange font-semibold py-2 rounded-lg text-xs transition-colors hover:bg-orange/20"
        >
          ランチ完了 → レビューへ
        </button>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-3 py-2 flex gap-2 items-end shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="メッセージを入力..."
          className="flex-1 px-3.5 py-2.5 bg-gray-50 rounded-full text-sm outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="bg-line hover:bg-line-dark disabled:bg-gray-200 text-white w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
