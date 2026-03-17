import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockMembershipGet = vi.fn();
const mockGroupDocGet = vi.fn();
const mockMsgAdd = vi.fn();
const mockMsgDocGet = vi.fn();

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
      if (col === "match_groups") {
        return { doc: vi.fn(() => ({ get: mockGroupDocGet })) };
      }
      if (col === "messages") {
        return {
          add: mockMsgAdd,
        };
      }
      return {};
    }),
  },
}));

function makeRequest(groupId: string, body: object) {
  return new Request(`http://localhost/api/chat/${groupId}/send`, {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeSnap(docs: Array<{ id: string; [key: string]: unknown }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d })),
  };
}

// 送信可能なグループ（未来の日付）
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  .toISOString().split("T")[0]; // 1週間後

beforeEach(() => {
  vi.clearAllMocks();
  mockMsgAdd.mockResolvedValue({
    id: "new-msg-id",
    get: mockMsgDocGet,
  });
  mockMsgDocGet.mockResolvedValue({
    id: "new-msg-id",
    data: () => ({
      group_id: "g1",
      sender_id: "u1",
      sender_name: "太郎",
      text: "テスト",
      is_system: false,
      created_at: new Date().toISOString(),
    }),
  });
});

describe("POST /api/chat/[groupId]/send", () => {
  it("未認証 → 401", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);
    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "hello" }), { params: { groupId: "g1" } });
    expect(res.status).toBe(401);
  });

  it("グループのメンバーでない → 403", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", nickname: "太郎" });
    mockMembershipGet.mockResolvedValue(makeSnap([]));
    mockGroupDocGet.mockResolvedValue({ exists: true, data: () => ({ date: futureDate, status: "pending" }) });

    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "hello" }), { params: { groupId: "g1" } });
    expect(res.status).toBe(403);
  });

  it("グループが存在しない → 404", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", nickname: "太郎" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockGroupDocGet.mockResolvedValue({ exists: false });

    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "hello" }), { params: { groupId: "g1" } });
    expect(res.status).toBe(404);
  });

  it("completed グループ → 403（チャット終了）", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", nickname: "太郎" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockGroupDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ date: futureDate, status: "completed" }),
    });

    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "hello" }), { params: { groupId: "g1" } });
    expect(res.status).toBe(403);
  });

  it("チャット期限切れ（過去の日付）→ 403", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", nickname: "太郎" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockGroupDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ date: "2020-01-02", status: "pending" }), // 過去
    });

    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "hello" }), { params: { groupId: "g1" } });
    expect(res.status).toBe(403);
  });

  it("空メッセージ → 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", nickname: "太郎" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockGroupDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ date: futureDate, status: "pending" }),
    });

    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "   " }), { params: { groupId: "g1" } });
    expect(res.status).toBe(400);
  });

  it("1001文字以上 → 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", nickname: "太郎" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockGroupDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ date: futureDate, status: "pending" }),
    });

    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "a".repeat(1001) }), { params: { groupId: "g1" } });
    expect(res.status).toBe(400);
  });

  it("正常送信 → 201 + message", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", nickname: "太郎" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockGroupDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ date: futureDate, status: "pending" }),
    });

    const { POST } = await import("@/app/api/chat/[groupId]/send/route");
    const res = await POST(makeRequest("g1", { text: "こんにちは！" }), { params: { groupId: "g1" } });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBeDefined();
    expect(mockMsgAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "こんにちは！",
        sender_id: "u1",
        is_system: false,
      })
    );
  });
});
