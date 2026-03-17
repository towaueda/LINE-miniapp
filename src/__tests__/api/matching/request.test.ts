import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockTryMatch = vi.fn();
const mockGetGroupWithMembers = vi.fn();
const mockExpireOldMatchRequests = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/matching", () => ({
  tryMatch: (...args: unknown[]) => mockTryMatch(...args),
  getGroupWithMembers: (...args: unknown[]) => mockGetGroupWithMembers(...args),
  expireOldMatchRequests: () => mockExpireOldMatchRequests(),
}));

const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockAdd = vi.fn();
const mockCollectionGet = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: mockCollectionGet,
      add: mockAdd,
      doc: vi.fn(() => ({ get: mockCollectionGet })),
    })),
    batch: () => ({ update: mockBatchUpdate, commit: mockBatchCommit }),
  },
}));

// ── ヘルパー ──────────────────────────────────────────
function makeUser(overrides: Partial<{
  id: string; is_approved: boolean; is_banned: boolean;
  nickname: string; area: string; industry: string;
}> = {}) {
  return {
    id: overrides.id ?? "u1",
    is_approved: overrides.is_approved ?? true,
    is_banned: overrides.is_banned ?? false,
    nickname: overrides.nickname ?? "太郎",
    area: overrides.area ?? "umeda",
    industry: overrides.industry ?? "it",
  };
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/matching/request", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 翌週以降の木曜日を動的に取得
function getNextThursday(weeksAhead = 1): string {
  const d = new Date();
  const daysUntilThursday = (4 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + daysUntilThursday + (weeksAhead - 1) * 7);
  return d.toISOString().split("T")[0];
}

function makeSnap(docs: Array<{ id: string; [key: string]: unknown }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d, ref: { update: vi.fn() } })),
  };
}

const validDates = [getNextThursday(1)];

beforeEach(() => {
  vi.clearAllMocks();
  mockExpireOldMatchRequests.mockResolvedValue(undefined);
  mockBatchCommit.mockResolvedValue(undefined);
  // デフォルト: グループなし・waitingなし
  mockCollectionGet.mockResolvedValue(makeSnap([]));
  mockAdd.mockResolvedValue({
    id: "new-req-id",
    get: vi.fn().mockResolvedValue({ id: "new-req-id", data: () => ({ status: "waiting" }) }),
  });
});

describe("POST /api/matching/request", () => {
  // ─── 認証・権限チェック ──────────────────────────
  describe("認証・権限チェック", () => {
    it("未認証 → 401", async () => {
      mockAuthenticateRequest.mockResolvedValue(null);
      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: validDates }));
      expect(res.status).toBe(401);
    });

    it("未承認ユーザー → 403", async () => {
      mockAuthenticateRequest.mockResolvedValue(makeUser({ is_approved: false }));
      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: validDates }));
      expect(res.status).toBe(403);
    });

    it("BAN ユーザー → 403", async () => {
      mockAuthenticateRequest.mockResolvedValue(makeUser({ is_banned: true }));
      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: validDates }));
      expect(res.status).toBe(403);
    });

    it("プロフィール未完成（nickname なし）→ 400", async () => {
      mockAuthenticateRequest.mockResolvedValue(makeUser({ nickname: "" }));
      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: validDates }));
      expect(res.status).toBe(400);
    });
  });

  // ─── 入力バリデーション ──────────────────────────
  describe("入力バリデーション", () => {
    beforeEach(() => {
      mockAuthenticateRequest.mockResolvedValue(makeUser());
    });

    it("無効なエリア → 400", async () => {
      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "invalid-area", dates: validDates }));
      expect(res.status).toBe(400);
    });

    it("日程なし → 400", async () => {
      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: [] }));
      expect(res.status).toBe(400);
    });

    it("木曜日以外 → 400", async () => {
      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: ["2026-04-06"] })); // 月曜
      expect(res.status).toBe(400);
    });
  });

  // ─── レビュー未完了チェック ──────────────────────
  describe("レビュー未完了チェック", () => {
    beforeEach(() => {
      mockAuthenticateRequest.mockResolvedValue(makeUser());
    });

    it("完了済みグループでレビュー未提出 → 400 + hasPendingReview", async () => {
      // グループメンバーに所属
      mockCollectionGet
        .mockResolvedValueOnce(makeSnap([{ id: "m1", group_id: "g1", user_id: "u1" }]))
        // グループ status = completed
        .mockResolvedValueOnce({ exists: true, id: "g1", data: () => ({ status: "completed" }) })
        // レビュー未提出（empty）
        .mockResolvedValueOnce(makeSnap([]));

      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: validDates }));

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.hasPendingReview).toBe(true);
    });
  });

  // ─── マッチング処理 ──────────────────────────────
  describe("マッチング処理", () => {
    beforeEach(() => {
      mockAuthenticateRequest.mockResolvedValue(makeUser());
      // グループ・レビューなし
      mockCollectionGet.mockResolvedValue(makeSnap([]));
    });

    it("即時マッチング成立 → matched と group を返す", async () => {
      mockTryMatch.mockResolvedValue("group-id-1");
      mockGetGroupWithMembers.mockResolvedValue({
        group: { id: "group-id-1", area: "umeda", date: validDates[0], status: "pending" },
        members: [{ id: "u1", nickname: "太郎" }, { id: "u2", nickname: "花子" }],
      });

      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: validDates }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("matched");
      expect(data.group.id).toBe("group-id-1");
    });

    it("マッチング不成立 → waiting と request を返す", async () => {
      mockTryMatch.mockResolvedValue(null);

      const { POST } = await import("@/app/api/matching/request/route");
      const res = await POST(makeRequest({ area: "umeda", dates: validDates }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("waiting");
    });

    it("既存の waiting リクエストがある → 先にキャンセルしてから新規作成", async () => {
      mockCollectionGet
        .mockResolvedValueOnce(makeSnap([]))  // グループメンバー
        .mockResolvedValueOnce(makeSnap([{ id: "old-req", status: "waiting" }])); // 既存waiting

      mockTryMatch.mockResolvedValue(null);

      const { POST } = await import("@/app/api/matching/request/route");
      await POST(makeRequest({ area: "umeda", dates: validDates }));

      expect(mockBatchUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "cancelled" })
      );
      expect(mockAdd).toHaveBeenCalled();
    });
  });
});
