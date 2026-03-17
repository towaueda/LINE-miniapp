import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Firestore モック ──────────────────────────────────
const mockGet = vi.fn();
const mockAdd = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockCollection = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: mockCollection,
  },
}));

function setupCollectionChain(result: object) {
  const chain = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue(result),
    add: mockAdd,
  };
  mockCollection.mockReturnValue(chain);
  return chain;
}

function makeSnap(docs: Array<{ id: string; [key: string]: unknown }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── verifyLineToken ───────────────────────────────────
describe("verifyLineToken", () => {
  it("有効なトークン → LINE プロフィールを返す", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ userId: "line-u1", displayName: "花子" }),
    } as Response);

    const { verifyLineToken } = await import("@/lib/auth");
    const result = await verifyLineToken("valid-token-unique-1");

    expect(result).toEqual({ userId: "line-u1", displayName: "花子" });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.line.me/v2/profile",
      expect.objectContaining({ headers: { Authorization: "Bearer valid-token-unique-1" } })
    );
  });

  it("LINE API が 401 → null を返す", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    const { verifyLineToken } = await import("@/lib/auth");
    const result = await verifyLineToken("invalid-token-unique-1");

    expect(result).toBeNull();
  });

  it("ネットワークエラー → null を返す", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));

    const { verifyLineToken } = await import("@/lib/auth");
    const result = await verifyLineToken("error-token-unique-1");

    expect(result).toBeNull();
  });

  it("同じトークンを2回呼ぶ → fetch は1回だけ（キャッシュ）", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ userId: "line-u2", displayName: "次郎" }),
    } as Response);

    const { verifyLineToken } = await import("@/lib/auth");
    await verifyLineToken("cached-token-unique-1");
    await verifyLineToken("cached-token-unique-1");

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// ── getOrCreateUser ───────────────────────────────────
describe("getOrCreateUser", () => {
  it("既存ユーザーが見つかる → そのユーザーを返す", async () => {
    const existingUser = {
      id: "db-u1",
      line_user_id: "line-u1",
      nickname: "太郎",
      is_approved: true,
      is_banned: false,
    };
    setupCollectionChain(makeSnap([existingUser]));

    const { getOrCreateUser } = await import("@/lib/auth");
    const result = await getOrCreateUser("line-u1", "太郎");

    expect(result?.id).toBe("db-u1");
    expect(result?.nickname).toBe("太郎");
  });

  it("ユーザーが存在しない → 新規作成して返す", async () => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(makeSnap([])),
      add: vi.fn().mockResolvedValue({ id: "new-db-u1" }),
    };
    mockCollection.mockReturnValue(chain);

    const { getOrCreateUser } = await import("@/lib/auth");
    const result = await getOrCreateUser("new-line-user", "新ユーザー", "INVITE-CODE");

    expect(chain.add).toHaveBeenCalledWith(
      expect.objectContaining({
        line_user_id: "new-line-user",
        nickname: "新ユーザー",
        is_approved: false,
        is_banned: false,
        invited_by_code: "INVITE-CODE",
      })
    );
    expect(result?.id).toBe("new-db-u1");
  });

  it("招待コードなしで新規作成 → invited_by_code が null", async () => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(makeSnap([])),
      add: vi.fn().mockResolvedValue({ id: "new-db-u2" }),
    };
    mockCollection.mockReturnValue(chain);

    const { getOrCreateUser } = await import("@/lib/auth");
    await getOrCreateUser("new-line-user2", "名無し");

    expect(chain.add).toHaveBeenCalledWith(
      expect.objectContaining({ invited_by_code: null })
    );
  });

  it("Firestore 書き込みエラー → null を返す", async () => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue(makeSnap([])),
      add: vi.fn().mockRejectedValue(new Error("Firestore error")),
    };
    mockCollection.mockReturnValue(chain);

    const { getOrCreateUser } = await import("@/lib/auth");
    const result = await getOrCreateUser("error-user", "エラーユーザー");

    expect(result).toBeNull();
  });
});

// ── getUserByLineId ───────────────────────────────────
describe("getUserByLineId", () => {
  it("ユーザーが存在する → DbUser を返す", async () => {
    const user = { id: "db-u2", line_user_id: "line-u2", nickname: "三郎" };
    setupCollectionChain(makeSnap([user]));

    const { getUserByLineId } = await import("@/lib/auth");
    const result = await getUserByLineId("line-u2");

    expect(result?.id).toBe("db-u2");
  });

  it("ユーザーが存在しない → null を返す", async () => {
    setupCollectionChain(makeSnap([]));

    const { getUserByLineId } = await import("@/lib/auth");
    const result = await getUserByLineId("nonexistent");

    expect(result).toBeNull();
  });
});

// ── authenticateRequest ───────────────────────────────
describe("authenticateRequest", () => {
  it("Authorization ヘッダーなし → null を返す", async () => {
    const req = new Request("http://localhost/api/test");

    const { authenticateRequest } = await import("@/lib/auth");
    const result = await authenticateRequest(req);

    expect(result).toBeNull();
  });

  it("Bearer ではないヘッダー → null を返す", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Basic sometoken" },
    });

    const { authenticateRequest } = await import("@/lib/auth");
    const result = await authenticateRequest(req);

    expect(result).toBeNull();
  });

  it("無効なトークン（LINE API 失敗）→ null を返す", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer bad-token-unique" },
    });

    const { authenticateRequest } = await import("@/lib/auth");
    const result = await authenticateRequest(req);

    expect(result).toBeNull();
  });

  it("有効トークン + 存在するユーザー → DbUser を返す", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ userId: "line-u3", displayName: "四郎" }),
    } as Response);

    const user = { id: "db-u3", line_user_id: "line-u3", nickname: "四郎" };
    setupCollectionChain(makeSnap([user]));

    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer auth-valid-token-unique" },
    });

    const { authenticateRequest } = await import("@/lib/auth");
    const result = await authenticateRequest(req);

    expect(result?.id).toBe("db-u3");
  });
});
