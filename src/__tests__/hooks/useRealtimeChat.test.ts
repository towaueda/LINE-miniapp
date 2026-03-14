import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useRealtimeChat } from "@/hooks/useRealtimeChat";

// apiFetch をモック
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

// supabase クライアントをモック
const mockUnsubscribe = vi.fn();
const mockSubscribe = vi.fn().mockReturnValue({ unsubscribe: mockUnsubscribe });
const mockOn = vi.fn().mockReturnThis();
const mockChannel = vi.fn().mockReturnValue({
  on: mockOn,
  subscribe: mockSubscribe,
  unsubscribe: mockUnsubscribe,
});

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: mockChannel,
  },
}));

import { apiFetch } from "@/lib/api";

const mockMessages = [
  {
    id: "msg-1",
    group_id: "g1",
    sender_id: "u1",
    sender_name: "太郎",
    text: "こんにちは",
    is_system: false,
    created_at: "2026-03-20T12:00:00Z",
  },
  {
    id: "msg-2",
    group_id: "g1",
    sender_id: null,
    sender_name: "システム",
    text: "マッチング成立！",
    is_system: true,
    created_at: "2026-03-20T11:00:00Z",
  },
];

describe("useRealtimeChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({
      messages: mockMessages,
      hasMore: false,
      nextCursor: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── 初期ロード ────────────────────────────────
  it("groupId が null → fetch しない", async () => {
    const { result } = renderHook(() => useRealtimeChat(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiFetch).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });

  it("groupId あり → 初期メッセージを読み込む", async () => {
    const { result } = renderHook(() => useRealtimeChat("group-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(apiFetch).toHaveBeenCalledWith("/api/chat/group-1");
    expect(result.current.messages).toHaveLength(2);
  });

  it("初期ロード中は loading:true", () => {
    // apiFetch が解決しない状態
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useRealtimeChat("group-1"));
    expect(result.current.loading).toBe(true);
  });

  it("apiFetch エラー → messages は空のまま", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useRealtimeChat("group-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.messages).toHaveLength(0);
  });

  // ─── Realtime 購読 ─────────────────────────────
  it("groupId あり → Supabase channel を購読", async () => {
    renderHook(() => useRealtimeChat("group-1"));

    await waitFor(() => {
      expect(mockChannel).toHaveBeenCalledWith("chat:group-1");
    });
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("アンマウント時に unsubscribe が呼ばれる", async () => {
    const { unmount } = renderHook(() => useRealtimeChat("group-1"));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalled();
    });

    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  it("Realtime INSERT イベント → messages に追加される", async () => {
    let realtimeCallback: ((payload: unknown) => void) | null = null;
    mockOn.mockImplementation((_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
      realtimeCallback = cb;
      return { subscribe: mockSubscribe, on: mockOn, unsubscribe: mockUnsubscribe };
    });

    const { result } = renderHook(() => useRealtimeChat("group-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const newMsg = {
      id: "msg-3",
      group_id: "group-1",
      sender_id: "u2",
      sender_name: "花子",
      text: "よろしく",
      is_system: false,
      created_at: "2026-03-20T12:30:00Z",
    };

    act(() => {
      realtimeCallback?.({ new: newMsg });
    });

    await waitFor(() => {
      expect(result.current.messages.some((m) => m.id === "msg-3")).toBe(true);
    });
  });

  it("重複 id のメッセージは無視される", async () => {
    let realtimeCallback: ((payload: unknown) => void) | null = null;
    mockOn.mockImplementation((_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
      realtimeCallback = cb;
      return { subscribe: mockSubscribe, on: mockOn, unsubscribe: mockUnsubscribe };
    });

    const { result } = renderHook(() => useRealtimeChat("group-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const initialCount = result.current.messages.length;

    // 既存の msg-1 と同じ id
    act(() => {
      realtimeCallback?.({ new: mockMessages[0] });
    });

    expect(result.current.messages.length).toBe(initialCount);
  });

  // ─── loadMore（ページネーション）──────────────
  it("hasMore:false → loadMore を呼んでも fetch しない", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      messages: mockMessages,
      hasMore: false,
      nextCursor: null,
    });

    const { result } = renderHook(() => useRealtimeChat("group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = vi.mocked(apiFetch).mock.calls.length;

    await act(async () => {
      await result.current.loadMore();
    });

    expect(vi.mocked(apiFetch).mock.calls.length).toBe(callsBefore);
  });

  it("hasMore:true → loadMore が古いメッセージを先頭に追加", async () => {
    const olderMessages = [
      {
        id: "msg-old",
        group_id: "g1",
        sender_id: "u3",
        sender_name: "次郎",
        text: "古いメッセージ",
        is_system: false,
        created_at: "2026-03-20T10:00:00Z",
      },
    ];

    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        messages: mockMessages,
        hasMore: true,
        nextCursor: "2026-03-20T11:00:00Z",
      })
      .mockResolvedValueOnce({
        messages: olderMessages,
        hasMore: false,
        nextCursor: null,
      });

    const { result } = renderHook(() => useRealtimeChat("group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.messages[0].id).toBe("msg-old");
    expect(result.current.hasMore).toBe(false);
  });

  // ─── sendMessage ───────────────────────────────
  it("空文字 → API 呼び出しなし", async () => {
    const { result } = renderHook(() => useRealtimeChat("group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = vi.mocked(apiFetch).mock.calls.length;

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(vi.mocked(apiFetch).mock.calls.length).toBe(callsBefore);
  });

  it("正常なテキスト → POST リクエスト送信", async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ messages: mockMessages, hasMore: false, nextCursor: null })
      .mockResolvedValueOnce({ message: {} }); // send レスポンス

    const { result } = renderHook(() => useRealtimeChat("group-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.sendMessage("テストメッセージ");
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/chat/group-1/send",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "テストメッセージ" }),
      })
    );
  });
});
