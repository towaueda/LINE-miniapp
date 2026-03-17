import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockMembershipGet = vi.fn();
const mockReviewExistsGet = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockInviteAdd = vi.fn().mockResolvedValue({ id: "inv-1" });

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
      if (col === "reviews") {
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: mockReviewExistsGet,
          doc: vi.fn(() => ({ id: "review-doc-id" })),
        };
      }
      if (col === "invite_codes") {
        return { add: mockInviteAdd };
      }
      return {};
    }),
    batch: () => ({
      set: mockBatchSet,
      commit: mockBatchCommit,
    }),
  },
}));

function makeRequest(body: object) {
  return new Request("http://localhost/api/reviews/submit", {
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

const validReviews = [
  { targetId: "u2", communication: 5, punctuality: 4, meetAgain: 5, comment: "素晴らしかった" },
  { targetId: "u3", communication: 3, punctuality: 3, meetAgain: 3, comment: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockBatchCommit.mockResolvedValue(undefined);
  mockInviteAdd.mockResolvedValue({ id: "inv-1" });
});

describe("POST /api/reviews/submit", () => {
  // ─── 認証・権限 ──────────────────────────────────
  it("未認証 → 401", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);
    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({ groupId: "g1", reviews: validReviews }));
    expect(res.status).toBe(401);
  });

  // ─── 入力バリデーション ──────────────────────────
  it("groupId なし → 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({ reviews: validReviews }));
    expect(res.status).toBe(400);
  });

  it("reviews が空配列 → 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({ groupId: "g1", reviews: [] }));
    expect(res.status).toBe(400);
  });

  it("スコアが範囲外（0）→ 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({
      groupId: "g1",
      reviews: [{ targetId: "u2", communication: 0, punctuality: 3, meetAgain: 3 }],
    }));
    expect(res.status).toBe(400);
  });

  it("コメントが500文字超 → 400", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({
      groupId: "g1",
      reviews: [{ targetId: "u2", communication: 3, punctuality: 3, meetAgain: 3, comment: "a".repeat(501) }],
    }));
    expect(res.status).toBe(400);
  });

  // ─── 権限チェック ────────────────────────────────
  it("グループのメンバーでない → 403", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([]));
    mockReviewExistsGet.mockResolvedValue(makeSnap([]));

    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({ groupId: "g1", reviews: validReviews }));
    expect(res.status).toBe(403);
  });

  it("既にレビュー済み → 409", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockReviewExistsGet.mockResolvedValue(makeSnap([{ id: "r1" }])); // 既存レビュー

    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({ groupId: "g1", reviews: validReviews }));
    expect(res.status).toBe(409);
  });

  // ─── 正常ケース ──────────────────────────────────
  it("正常送信 → success: true + TRI- 形式の inviteCode", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockReviewExistsGet.mockResolvedValue(makeSnap([]));

    const { POST } = await import("@/app/api/reviews/submit/route");
    const res = await POST(makeRequest({ groupId: "g1", reviews: validReviews }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.inviteCode).toMatch(/^TRI-[A-Z0-9]{6}$/);
  });

  it("レビューが Firestore に保存される", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockReviewExistsGet.mockResolvedValue(makeSnap([]));

    const { POST } = await import("@/app/api/reviews/submit/route");
    await POST(makeRequest({ groupId: "g1", reviews: validReviews }));

    expect(mockBatchSet).toHaveBeenCalledTimes(validReviews.length);
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        group_id: "g1",
        reviewer_id: "u1",
        target_id: "u2",
        communication: 5,
      })
    );
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it("招待コードが invite_codes コレクションに追加される", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockReviewExistsGet.mockResolvedValue(makeSnap([]));

    const { POST } = await import("@/app/api/reviews/submit/route");
    await POST(makeRequest({ groupId: "g1", reviews: validReviews }));

    await vi.waitFor(() => {
      expect(mockInviteAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          generated_by: "u1",
          group_id: "g1",
          is_active: true,
          used_by: null,
        })
      );
    });
  });

  it("コメントなし → null として保存される", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockMembershipGet.mockResolvedValue(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]));
    mockReviewExistsGet.mockResolvedValue(makeSnap([]));

    const { POST } = await import("@/app/api/reviews/submit/route");
    await POST(makeRequest({
      groupId: "g1",
      reviews: [{ targetId: "u2", communication: 3, punctuality: 3, meetAgain: 3 }],
    }));

    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ comment: null })
    );
  });
});
