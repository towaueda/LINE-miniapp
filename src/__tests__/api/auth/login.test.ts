import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// ── 環境変数 ─────────────────────────────────────────
const MASTER_CODE = "MASTER-TEST-CODE";
process.env.INVITE_CODE_HASH = createHash("sha256").update(MASTER_CODE).digest("hex");

// ── モック ────────────────────────────────────────────
const mockVerifyLineToken = vi.fn();
const mockGetOrCreateUser = vi.fn();

vi.mock("@/lib/auth", () => ({
  verifyLineToken: (...args: unknown[]) => mockVerifyLineToken(...args),
  getOrCreateUser: (...args: unknown[]) => mockGetOrCreateUser(...args),
}));

const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockDocRef = { update: mockDocUpdate };
const mockInviteGet = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: (col: string) => {
      if (col === "invite_codes") {
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: mockInviteGet,
        };
      }
      // users collection
      return { doc: vi.fn(() => mockDocRef) };
    },
  },
}));

// ── ヘルパー ──────────────────────────────────────────
function makeUser(overrides: Partial<{
  id: string; is_banned: boolean; is_approved: boolean; nickname: string;
}> = {}) {
  return {
    id: overrides.id ?? "db-u1",
    line_user_id: "line-u1",
    nickname: overrides.nickname ?? "太郎",
    is_banned: overrides.is_banned ?? false,
    is_approved: overrides.is_approved ?? false,
    invited_by_code: null,
  };
}

function makeRequest(body: object) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDocUpdate.mockResolvedValue(undefined);
  mockInviteGet.mockResolvedValue({ empty: true, docs: [] }); // default: code not found
});

describe("POST /api/auth/login", () => {
  // ─── 認証失敗 ────────────────────────────────────
  describe("認証失敗", () => {
    it("accessToken なし → 400", async () => {
      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({}));
      expect(res.status).toBe(400);
    });

    it("LINE トークン無効 → 401", async () => {
      mockVerifyLineToken.mockResolvedValue(null);
      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "bad-token" }));
      expect(res.status).toBe(401);
    });

    it("BAN されたユーザー → 403", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(makeUser({ is_banned: true }));

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token" }));

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/banned/i);
    });
  });

  // ─── 正常ログイン ────────────────────────────────
  describe("正常ログイン", () => {
    it("既存ユーザー → user を返す", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(makeUser({ is_approved: true }));

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token" }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.id).toBe("db-u1");
    });

    it("ユーザー作成失敗 → 500", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(null);

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token" }));

      expect(res.status).toBe(500);
    });
  });

  // ─── マスター招待コード ──────────────────────────
  describe("マスター招待コードによる承認", () => {
    it("有効なマスターコード → is_approved: true で返す", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(makeUser({ is_approved: false }));

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token", inviteCode: MASTER_CODE }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.is_approved).toBe(true);
      expect(data.user.invited_by_code).toBe("master");
      expect(mockDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ is_approved: true, invited_by_code: "master" })
      );
    });

    it("無効なマスターコード → is_approved: false のまま", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(makeUser({ is_approved: false }));

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token", inviteCode: "WRONG-CODE" }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.is_approved).toBe(false);
    });

    it("すでに承認済み → コードチェックをスキップ", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(makeUser({ is_approved: true }));

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token", inviteCode: MASTER_CODE }));

      expect(res.status).toBe(200);
      expect(mockDocUpdate).not.toHaveBeenCalled();
    });
  });

  // ─── ユーザー生成招待コード ──────────────────────
  describe("ユーザー生成招待コード（TRI-XXXXXX）による承認", () => {
    it("有効な Firestore コード → is_approved: true で返す・コードを使用済みに", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(makeUser({ is_approved: false }));

      const mockInviteDocUpdate = vi.fn().mockResolvedValue(undefined);
      mockInviteGet.mockResolvedValueOnce({
        empty: false,
        docs: [{ ref: { update: mockInviteDocUpdate } }],
      });

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token", inviteCode: "TRI-ABCDEF" }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.is_approved).toBe(true);
      expect(mockInviteDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ used_by: "db-u1" })
      );
    });

    it("存在しない Firestore コード → is_approved: false のまま", async () => {
      mockVerifyLineToken.mockResolvedValue({ userId: "line-u1", displayName: "太郎" });
      mockGetOrCreateUser.mockResolvedValue(makeUser({ is_approved: false }));
      // mockInviteGet は beforeEach で { empty: true } を返すデフォルト設定済み

      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(makeRequest({ accessToken: "valid-token", inviteCode: "TRI-INVALID" }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.is_approved).toBe(false);
    });
  });
});
