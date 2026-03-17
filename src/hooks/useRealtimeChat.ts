"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { collection, query, where, orderBy, onSnapshot, limit, Query, DocumentData } from "firebase/firestore";
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
  const unsubscribeRef = useRef<(() => void) | null>(null);

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

  // Firestore リアルタイム購読
  useEffect(() => {
    if (!groupId) return;
    if (unsubscribeRef.current) return;

    import("@/lib/firebase/client").then(({ db }) => {
      const q = query(
        collection(db, "messages"),
        where("group_id", "==", groupId),
        orderBy("created_at", "desc"),
        limit(1)
      ) as Query<DocumentData>;

      const unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const data = change.doc.data();
            const newMsg = dbToChat({
              id: change.doc.id,
              group_id: data.group_id,
              sender_id: data.sender_id,
              sender_name: data.sender_name,
              text: data.text,
              is_system: data.is_system,
              created_at: data.created_at,
            });
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        });
      });

      unsubscribeRef.current = unsubscribe;
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
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
        await apiFetch(`/api/chat/${groupId}/send`, {
          method: "POST",
          body: JSON.stringify({ text: text.trim() }),
        });
      } catch (e) {
        console.error("メッセージ送信失敗:", e);
      }
    },
    [groupId]
  );

  return { messages, loading, hasMore, loadMore, sendMessage };
}
