import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── apiFetch モック ───────────────────────────────────
const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));

// ── Firebase onSnapshot モック ────────────────────────
const mockUnsubscribe = vi.fn();
let capturedSnapshotCallback: ((snap: object) => void) | null = null;

const mockOnSnapshot = vi.fn((q, callback) => {
  capturedSnapshotCallback = callback;
  return mockUnsubscribe;
});

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: (...args: Parameters<typeof mockOnSnapshot>) => mockOnSnapshot(...args),
}));

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

function makeDbMessage(overrides: Partial<{
  id: string; group_id: string; sender_id: string | null;
  sender_name: string; text: string; is_system: boolean; created_at: string;
}> = {}) {
  return {
    id: overrides.id !== undefined ? overrides.id : "msg-1",
    group_id: overrides.group_id !== undefined ? overrides.group_id : "g1",
    sender_id: overrides.sender_id !== undefined ? overrides.sender_id : "u1", // null を明示的に許可
    sender_name: overrides.sender_name !== undefined ? overrides.sender_name : "太郎",
    text: overrides.text !== undefined ? overrides.text : "こんにちは",
    is_system: overrides.is_system !== undefined ? overrides.is_system : false,
    created_at: overrides.created_at !== undefined ? overrides.created_at : "2026-04-03T12:00:00.000Z",
  };
}

function makeChatResponse(messages: ReturnType<typeof makeDbMessage>[], hasMore = false) {
  return { messages, hasMore, nextCursor: hasMore ? messages[messages.length - 1]?.created_at : null };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedSnapshotCallback = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useRealtimeChat", () => {
  // ─── 初期ロード ─────────────────────────────────
  describe("初期ロード", () => {
    it("groupId が null → loading=false でメッセージ空", async () => {
      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat(null));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.messages).toHaveLength(0);
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it("groupId あり → /api/chat/[groupId] を呼ぶ", async () => {
      mockApiFetch.mockResolvedValue(makeChatResponse([makeDbMessage()]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(mockApiFetch).toHaveBeenCalledWith("/api/chat/g1");
    });

    it("初期メッセージが正しく変換される", async () => {
      const msg = makeDbMessage({ text: "初期メッセージ", sender_name: "花子" });
      mockApiFetch.mockResolvedValue(makeChatResponse([msg]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.messages[0].text).toBe("初期メッセージ");
      expect(result.current.messages[0].senderName).toBe("花子");
    });

    it("API エラー → loading が false になる（エラーをスロー しない）", async () => {
      mockApiFetch.mockRejectedValue(new Error("fetch error"));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.messages).toHaveLength(0);
    });

    it("hasMore=true → hasMore が true になる", async () => {
      const messages = [makeDbMessage({ id: "m1" }), makeDbMessage({ id: "m2" })];
      mockApiFetch.mockResolvedValue(makeChatResponse(messages, true));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.hasMore).toBe(true);
    });

    it("is_system=true のメッセージ → isSystem が true", async () => {
      const msg = makeDbMessage({ is_system: true, sender_id: null, sender_name: "システム" });
      mockApiFetch.mockResolvedValue(makeChatResponse([msg]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.messages[0].isSystem).toBe(true);
      expect(result.current.messages[0].senderId).toBe("system");
    });
  });

  // ─── リアルタイム受信 ────────────────────────────
  describe("リアルタイム受信（onSnapshot）", () => {
    it("新しいメッセージが追加される", async () => {
      mockApiFetch.mockResolvedValue(makeChatResponse([]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(capturedSnapshotCallback).not.toBeNull();

      const newMsg = makeDbMessage({ id: "realtime-1", text: "リアルタイムメッセージ" });
      act(() => {
        capturedSnapshotCallback!({
          docChanges: () => [
            {
              type: "added",
              doc: { id: newMsg.id, data: () => newMsg },
            },
          ],
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].text).toBe("リアルタイムメッセージ");
    });

    it("同じIDのメッセージは重複追加しない", async () => {
      const existing = makeDbMessage({ id: "msg-dup", text: "既存" });
      mockApiFetch.mockResolvedValue(makeChatResponse([existing]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      act(() => {
        capturedSnapshotCallback!({
          docChanges: () => [
            {
              type: "added",
              doc: { id: "msg-dup", data: () => existing },
            },
          ],
        });
      });

      expect(result.current.messages).toHaveLength(1);
    });
  });

  // ─── loadMore（ページネーション）────────────────
  describe("loadMore", () => {
    it("hasMore=false なら loadMore で API を呼ばない", async () => {
      mockApiFetch.mockResolvedValue(makeChatResponse([makeDbMessage()], false));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const callCount = mockApiFetch.mock.calls.length;
      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockApiFetch.mock.calls.length).toBe(callCount);
    });

    it("hasMore=true → loadMore で古いメッセージを追加取得", async () => {
      const newMsg = makeDbMessage({ id: "m-new", created_at: "2026-04-03T12:00:00.000Z" });
      const oldMsg = makeDbMessage({ id: "m-old", text: "古いメッセージ", created_at: "2026-04-03T11:00:00.000Z" });

      mockApiFetch
        .mockResolvedValueOnce(makeChatResponse([newMsg], true))
        .mockResolvedValueOnce(makeChatResponse([oldMsg], false));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.hasMore).toBe(true);

      await act(async () => {
        await result.current.loadMore();
      });

      expect(result.current.messages.length).toBe(2);
      expect(result.current.messages[0].id).toBe("m-old");
      expect(result.current.hasMore).toBe(false);
    });
  });

  // ─── sendMessage ─────────────────────────────────
  describe("sendMessage", () => {
    it("テキストを POST /api/chat/[groupId]/send に送信する", async () => {
      mockApiFetch.mockResolvedValue(makeChatResponse([]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      mockApiFetch.mockResolvedValueOnce({});
      await act(async () => {
        await result.current.sendMessage("テストメッセージ");
      });

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/chat/g1/send",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ text: "テストメッセージ" }),
        })
      );
    });

    it("空文字列 → API を呼ばない", async () => {
      mockApiFetch.mockResolvedValue(makeChatResponse([]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      const callCount = mockApiFetch.mock.calls.length;
      await act(async () => {
        await result.current.sendMessage("   ");
      });

      expect(mockApiFetch.mock.calls.length).toBe(callCount);
    });
  });

  // ─── アンマウント時のクリーンアップ ─────────────
  describe("クリーンアップ", () => {
    it("アンマウント時に onSnapshot の購読を解除する", async () => {
      mockApiFetch.mockResolvedValue(makeChatResponse([]));

      const { useRealtimeChat } = await import("@/hooks/useRealtimeChat");
      const { result, unmount } = renderHook(() => useRealtimeChat("g1"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      unmount();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
