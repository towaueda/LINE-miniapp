import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockGetGroupWithMembers = vi.fn();
vi.mock("@/lib/matching", () => ({
  getGroupWithMembers: (...args: unknown[]) => mockGetGroupWithMembers(...args),
}));

const mockCollectionGet = vi.fn();
const mockDocGet = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: mockCollectionGet,
      doc: vi.fn(() => ({ get: mockDocGet })),
    })),
  },
}));

function makeRequest() {
  return new Request("http://localhost/api/matching/status", {
    headers: { Authorization: "Bearer token" },
  });
}

function makeSnap(docs: Array<{ id: string; [key: string]: unknown }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d })),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/matching/status", () => {
  it("未認証 → 401", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);
    const { GET } = await import("@/app/api/matching/status/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("グループなし・リクエストなし → { status: 'idle' }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockCollectionGet
      .mockResolvedValueOnce(makeSnap([]))   // match_group_members
      .mockResolvedValueOnce(makeSnap([]));  // match_requests

    const { GET } = await import("@/app/api/matching/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("idle");
  });

  it("waiting リクエストあり → { status: 'waiting' }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockCollectionGet
      .mockResolvedValueOnce(makeSnap([]))  // グループメンバーなし
      .mockResolvedValueOnce(
        makeSnap([{ id: "req-1", status: "waiting", available_dates: ["2026-04-03"], updated_at: new Date().toISOString() }])
      );

    const { GET } = await import("@/app/api/matching/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("waiting");
  });

  it("pending グループあり → { status: 'matched', group, members }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockCollectionGet
      .mockResolvedValueOnce(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]))
      .mockResolvedValueOnce(makeSnap([])); // リクエストなし

    // グループ doc
    mockDocGet.mockResolvedValueOnce({ exists: true, id: "g1", data: () => ({ status: "pending" }) });

    mockGetGroupWithMembers.mockResolvedValue({
      group: { id: "g1", area: "umeda", status: "pending" },
      members: [{ id: "u1", nickname: "太郎" }],
    });

    const { GET } = await import("@/app/api/matching/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("matched");
    expect(data.group.id).toBe("g1");
  });

  it("two_person_offered → { status: 'two_person_offered', proposedDates }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockCollectionGet
      .mockResolvedValueOnce(makeSnap([]))  // グループメンバーなし
      .mockResolvedValueOnce(
        makeSnap([{
          id: "req-1",
          status: "two_person_offered",
          available_dates: ["2026-04-10"],
          two_person_partner_id: "req-2",
          updated_at: new Date().toISOString(),
        }])
      );

    // パートナーは match_requests.doc(id).get() で取得される
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ available_dates: ["2026-04-10"] }),
    });

    const { GET } = await import("@/app/api/matching/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("two_person_offered");
    expect(Array.isArray(data.proposedDates)).toBe(true);
  });

  it("no_match（7日以内）→ { status: 'no_match' }", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    const recentDate = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1時間前
    mockCollectionGet
      .mockResolvedValueOnce(makeSnap([]))
      .mockResolvedValueOnce(
        makeSnap([{ id: "req-1", status: "no_match", updated_at: recentDate }])
      );

    const { GET } = await import("@/app/api/matching/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("no_match");
  });

  it("完了済みグループ + レビュー未提出 → hasPendingReview: true", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockCollectionGet
      .mockResolvedValueOnce(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]))
      .mockResolvedValueOnce(makeSnap([])); // リクエストなし

    // グループ status = completed
    mockDocGet.mockResolvedValueOnce({ exists: true, id: "g1", data: () => ({ status: "completed" }) });

    // レビュー未提出
    mockCollectionGet.mockResolvedValueOnce(makeSnap([]));

    const { GET } = await import("@/app/api/matching/status/route");
    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hasPendingReview).toBe(true);
  });
});
