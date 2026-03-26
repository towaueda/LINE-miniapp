"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { ChatMessage } from "@/types";
import { apiFetch } from "@/lib/api";

interface DbMessagePayload {
  id: string;
  group_id: string;
  sender_id: string | null;
  sender_name: string;
  text: string;
  is_system: boolean;
  created_at: string;
}

interface ChatResponse {
  messages: DbMessagePayload[];
  hasMore: boolean;
  nextCursor: string | null;
}

function dbToChat(msg: DbMessagePayload): ChatMessage {
  return {
    id: msg.id,
    senderId: msg.sender_id || "system",
    senderName: msg.sender_name,
    text: msg.text,
    timestamp: new Date(msg.created_at).toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    isSystem: msg.is_system,
  };
}

export function useRealtimeChat(groupId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  // 初期履歴の読み込み
  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    apiFetch<ChatResponse>(`/api/chat/${groupId}`)
      .then((data) => {
        setMessages(data.messages.map(dbToChat));
        setHasMore(data.hasMore);
        nextCursorRef.current = data.nextCursor;
      })
      .catch((e) => {
        console.error("チャット履歴の読み込み失敗:", e);
      })
      .finally(() => setLoading(false));
  }, [groupId]);

  // ポーリングによる定期更新（3秒ごと）
  useEffect(() => {
    if (!groupId) return;
    const poll = async () => {
      try {
        const data = await apiFetch<ChatResponse>(`/api/chat/${groupId}`);
        const fetched = data.messages.map(dbToChat);
        setMessages((prev) => {
          const prevIds = new Set(prev.map((m) => m.id));
          const newOnly = fetched.filter((m) => !prevIds.has(m.id));
          if (newOnly.length === 0) return prev;
          return [...prev, ...newOnly];
        });
      } catch {
        // polling は silent fail
      }
    };
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [groupId]);

  // 過去のメッセージを読み込み（ページネーション）
  const loadMore = useCallback(async () => {
    if (!groupId || !hasMore || loadingMoreRef.current || !nextCursorRef.current) return;
    loadingMoreRef.current = true;

    try {
      const data = await apiFetch<ChatResponse>(
        `/api/chat/${groupId}?before=${encodeURIComponent(nextCursorRef.current)}`
      );
      const older = data.messages.map(dbToChat);
      setMessages((prev) => [...older, ...prev]);
      setHasMore(data.hasMore);
      nextCursorRef.current = data.nextCursor;
    } catch (e) {
      console.error("追加メッセージの読み込み失敗:", e);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [groupId, hasMore]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!groupId || !text.trim()) return;
      try {
        const data = await apiFetch<{ message: DbMessagePayload }>(`/api/chat/${groupId}/send`, {
          method: "POST",
          body: JSON.stringify({ text: text.trim() }),
        });
        // APIレスポンスで即時ローカル追加（Firestoreのリアルタイムより先に表示）
        if (data.message) {
          const newMsg = dbToChat(data.message);
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      } catch (e) {
        console.error("メッセージ送信失敗:", e);
      }
    },
    [groupId]
  );

  return { messages, loading, hasMore, loadMore, sendMessage };
}
