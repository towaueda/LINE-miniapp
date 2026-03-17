import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockMembershipGet = vi.fn();
const mockMessagesGet = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn((col: string) => {
      if (col === "match_group_members") {
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: mockMembershipGet,
        };
      }
      if (col === "messages") {
        return {
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: mockMessagesGet,
        };
      }
      return {};
    }),
  },
}));

function makeRequest(groupId: string, query = "") {
  return new Request(`http://localhost/api/chat/${groupId}${query}`, {
    headers: { Authorization: "Bearer token" },
  });
}

function makeSnap(docs: Array<{ id: string; [key: string]: unknown }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d })),
  };
}

function makeMessage(id: string, text: string, createdAt: string) {
  return {
    id,
    group_id: "g1",
    sender_id: "u1",
    sender_name: "太郎",
    text,
    is_system: false,
    created_at: createdAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/chat/[groupId]", () => {
  it("未認証 → 401", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);
    const { GET } = await import("@/app/api/chat/[groupId]/route");
    const res = await GET(makeRequest("g1"), { params: { groupId: "g1" } });
    expect(res.status).toBe(401);
  });

  it("グループのメンバーでない → 403", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([]));
    mockMessagesGet.mockResolvedValue(makeSnap([]));

    const { GET } = await import("@/app/api/chat/[groupId]/route");
    const res = await GET(makeRequest("g1"), { params: { groupId: "g1" } });
    expect(res.status).toBe(403);
  });

  it("メンバー → メッセージ一覧と hasMore: false を返す", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockMessagesGet.mockResolvedValue(
      makeSnap([
        makeMessage("msg-1", "こんにちは", "2026-04-03T12:00:00.000Z"),
        makeMessage("msg-2", "よろしく", "2026-04-03T12:01:00.000Z"),
      ])
    );

    const { GET } = await import("@/app/api/chat/[groupId]/route");
    const res = await GET(makeRequest("g1"), { params: { groupId: "g1" } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toHaveLength(2);
    expect(data.hasMore).toBe(false);
    expect(data.nextCursor).toBeNull();
  });

  it("limit+1 件返ってきた場合 → hasMore: true・nextCursor が設定される", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));

    // 51件返す（デフォルト limit=50 + 1）
    const msgs = Array.from({ length: 51 }, (_, i) =>
      makeMessage(`msg-${i}`, `メッセージ${i}`, `2026-04-03T12:${String(i).padStart(2, "0")}:00.000Z`)
    );
    mockMessagesGet.mockResolvedValue(makeSnap(msgs));

    const { GET } = await import("@/app/api/chat/[groupId]/route");
    const res = await GET(makeRequest("g1"), { params: { groupId: "g1" } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toHaveLength(50);
    expect(data.hasMore).toBe(true);
    expect(data.nextCursor).not.toBeNull();
  });

  it("メッセージが昇順（古い→新しい）に並んでいる", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    // desc で返ってくる想定（ルートが reverse する）
    mockMessagesGet.mockResolvedValue(
      makeSnap([
        makeMessage("msg-b", "新しい", "2026-04-03T12:01:00.000Z"),
        makeMessage("msg-a", "古い", "2026-04-03T12:00:00.000Z"),
      ])
    );

    const { GET } = await import("@/app/api/chat/[groupId]/route");
    const res = await GET(makeRequest("g1"), { params: { groupId: "g1" } });

    const data = await res.json();
    expect(data.messages[0].id).toBe("msg-a");
    expect(data.messages[1].id).toBe("msg-b");
  });
});
