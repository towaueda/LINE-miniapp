"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { ChatMessage } from "@/types";
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load history
  useEffect(() => {
    if (!groupId) return;
    setLoading(true);

    apiFetch<{ messages: DbMessagePayload[] }>(`/api/chat/${groupId}`)
      .then((data) => {
        setMessages(data.messages.map(dbToChat));
      })
      .catch((e) => {
        console.error("Failed to load chat history:", e);
      })
      .finally(() => setLoading(false));
  }, [groupId]);

  // Subscribe to realtime
  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`chat:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const newMsg = dbToChat(payload.new as DbMessagePayload);
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [groupId]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!groupId || !text.trim()) return;
      try {
        await apiFetch(`/api/chat/${groupId}/send`, {
          method: "POST",
          body: JSON.stringify({ text: text.trim() }),
        });
      } catch (e) {
        console.error("Failed to send message:", e);
      }
    },
    [groupId]
  );

  return { messages, loading, sendMessage };
}
