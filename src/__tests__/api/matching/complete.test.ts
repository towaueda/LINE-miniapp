import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockMembersGet = vi.fn();
const mockMemberUpdate = vi.fn().mockResolvedValue(undefined);
const mockGroupUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn((col: string) => {
      if (col === "match_group_members") {
        return {
          where: vi.fn().mockReturnThis(),
          get: mockMembersGet,
          doc: vi.fn(() => ({ update: mockMemberUpdate })),
        };
      }
      if (col === "match_groups") {
        return { doc: vi.fn(() => ({ update: mockGroupUpdate })) };
      }
      return {};
    }),
  },
}));

function makeRequest(body: object) {
  return new Request("http://localhost/api/matching/complete", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeMembersSnap(members: Array<{ id: string; user_id: string; completed_at: string | null }>) {
  return {
    empty: members.length === 0,
    docs: members.map((m) => ({
      id: m.id,
      data: () => m,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMemberUpdate.mockResolvedValue(undefined);
  mockGroupUpdate.mockResolvedValue(undefined);
});

describe("POST /api/matching/complete", () => {
  it("未認証 → 401", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);
    const { POST } = await import("@/app/api/matching/complete/route");
    const res = await POST(makeRequest({ groupId: "g1" }));
    expect(res.status).toBe(401);
  });

  it("groupId なし → 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    const { POST } = await import("@/app/api/matching/complete/route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("グループのメンバーでない → 403", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembersGet.mockResolvedValue(makeMembersSnap([]));

    const { POST } = await import("@/app/api/matching/complete/route");
    const res = await POST(makeRequest({ groupId: "g1" }));
    expect(res.status).toBe(403);
  });

  it("自分以外がまだ未完了 → confirmed < total を返す", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembersGet.mockResolvedValue(
      makeMembersSnap([
        { id: "m1", user_id: "u1", completed_at: null },
        { id: "m2", user_id: "u2", completed_at: null },
        { id: "m3", user_id: "u3", completed_at: null },
      ])
    );

    const { POST } = await import("@/app/api/matching/complete/route");
    const res = await POST(makeRequest({ groupId: "g1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.confirmed).toBe(1);
    expect(data.total).toBe(3);
    expect(data.allConfirmed).toBe(false);
    expect(mockMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ completed_at: expect.any(String) })
    );
    expect(mockGroupUpdate).not.toHaveBeenCalled();
  });

  it("全員完了 → グループを completed に更新・allConfirmed: true", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembersGet.mockResolvedValue(
      makeMembersSnap([
        { id: "m1", user_id: "u1", completed_at: null },
        { id: "m2", user_id: "u2", completed_at: "2026-04-03T13:00:00.000Z" },
        { id: "m3", user_id: "u3", completed_at: "2026-04-03T13:01:00.000Z" },
      ])
    );

    const { POST } = await import("@/app/api/matching/complete/route");
    const res = await POST(makeRequest({ groupId: "g1" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allConfirmed).toBe(true);
    expect(mockGroupUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
  });

  it("すでに完了済みのメンバー → 二重更新しない", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembersGet.mockResolvedValue(
      makeMembersSnap([
        { id: "m1", user_id: "u1", completed_at: "2026-04-03T13:00:00.000Z" },
        { id: "m2", user_id: "u2", completed_at: null },
      ])
    );

    const { POST } = await import("@/app/api/matching/complete/route");
    await POST(makeRequest({ groupId: "g1" }));

    expect(mockMemberUpdate).not.toHaveBeenCalled();
  });
});
