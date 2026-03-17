import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockConfirmTwoPersonMatch = vi.fn();
const mockDeclineTwoPersonMatch = vi.fn();
const mockGetGroupWithMembers = vi.fn();
vi.mock("@/lib/matching", () => ({
  confirmTwoPersonMatch: (...args: unknown[]) => mockConfirmTwoPersonMatch(...args),
  declineTwoPersonMatch: (...args: unknown[]) => mockDeclineTwoPersonMatch(...args),
  getGroupWithMembers: (...args: unknown[]) => mockGetGroupWithMembers(...args),
}));

const mockCollectionGet = vi.fn();
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: mockCollectionGet,
    })),
  },
}));

function makeRequest(body: object) {
  return new Request("http://localhost/api/matching/two-person-response", {
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/matching/two-person-response", () => {
  it("未認証 → 401", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);
    const { POST } = await import("@/app/api/matching/two-person-response/route");
    const res = await POST(makeRequest({ action: "accept" }));
    expect(res.status).toBe(401);
  });

  it("未承認ユーザー → 403", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", is_approved: false, is_banned: false });
    const { POST } = await import("@/app/api/matching/two-person-response/route");
    const res = await POST(makeRequest({ action: "accept" }));
    expect(res.status).toBe(403);
  });

  it("無効な action → 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", is_approved: true, is_banned: false });
    mockCollectionGet.mockResolvedValue(
      makeSnap([{ id: "req-1", status: "two_person_offered" }])
    );

    const { POST } = await import("@/app/api/matching/two-person-response/route");
    const res = await POST(makeRequest({ action: "maybe" }));
    expect(res.status).toBe(400);
  });

  it("オファーが見つからない → 404", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", is_approved: true, is_banned: false });
    mockCollectionGet.mockResolvedValue(makeSnap([]));

    const { POST } = await import("@/app/api/matching/two-person-response/route");
    const res = await POST(makeRequest({ action: "accept" }));
    expect(res.status).toBe(404);
  });

  it("accept → 相手待ち → { status: 'waiting_for_partner' }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", is_approved: true, is_banned: false });
    mockCollectionGet.mockResolvedValue(
      makeSnap([{ id: "req-1", status: "two_person_offered" }])
    );
    mockConfirmTwoPersonMatch.mockResolvedValue(null); // まだグループ未作成

    const { POST } = await import("@/app/api/matching/two-person-response/route");
    const res = await POST(makeRequest({ action: "accept" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("waiting_for_partner");
    expect(mockConfirmTwoPersonMatch).toHaveBeenCalledWith("req-1");
  });

  it("accept → 両者承諾 → { status: 'matched', group, members }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", is_approved: true, is_banned: false });
    mockCollectionGet.mockResolvedValue(
      makeSnap([{ id: "req-1", status: "two_person_offered" }])
    );
    mockConfirmTwoPersonMatch.mockResolvedValue("group-2p");
    mockGetGroupWithMembers.mockResolvedValue({
      group: { id: "group-2p", area: "namba", status: "pending" },
      members: [{ id: "u1", nickname: "太郎" }, { id: "u2", nickname: "花子" }],
    });

    const { POST } = await import("@/app/api/matching/two-person-response/route");
    const res = await POST(makeRequest({ action: "accept" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("matched");
    expect(data.group.id).toBe("group-2p");
  });

  it("decline → { status: 'no_match' }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1", is_approved: true, is_banned: false });
    mockCollectionGet.mockResolvedValue(
      makeSnap([{ id: "req-1", status: "two_person_offered" }])
    );
    mockDeclineTwoPersonMatch.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/matching/two-person-response/route");
    const res = await POST(makeRequest({ action: "decline" }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("no_match");
    expect(mockDeclineTwoPersonMatch).toHaveBeenCalledWith("req-1");
  });
});
