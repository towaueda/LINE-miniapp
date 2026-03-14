import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyLineToken, authenticateRequest } from "@/lib/auth";

// supabaseAdmin をモック
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "@/lib/supabase/server";
import { createQueryBuilder, makeDbUser } from "../../helpers/supabaseMock";

// ─────────────────────────────────────────────
// verifyLineToken
// ─────────────────────────────────────────────
describe("verifyLineToken", () => {
  const mockProfile = { userId: "Uline123", displayName: "テストユーザー" };

  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockProfile), { status: 200 })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // キャッシュをリセットするため、モジュールをリロードする
    vi.resetModules();
  });

  it("有効なトークン → {userId, displayName} を返す", async () => {
    // モジュールキャッシュの影響を受けないよう動的インポート
    const { verifyLineToken: fn } = await import("@/lib/auth");
    const result = await fn("valid-token");
    expect(result).toEqual({ userId: "Uline123", displayName: "テストユーザー" });
  });

  it("LINE API が 401 → null を返す", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 401 })
    );
    const { verifyLineToken: fn } = await import("@/lib/auth");
    const result = await fn("invalid-token");
    expect(result).toBeNull();
  });

  it("ネットワークエラー → null を返す", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("network error"));
    const { verifyLineToken: fn } = await import("@/lib/auth");
    const result = await fn("error-token");
    expect(result).toBeNull();
  });

  it("同じトークンで2回呼んでも fetch は1回だけ（キャッシュ）", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockProfile), { status: 200 })
    );
    const { verifyLineToken: fn } = await import("@/lib/auth");

    await fn("cached-token");
    await fn("cached-token");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("TTL（5分）経過後 → fetch を再実行", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockProfile), { status: 200 })
    );
    const { verifyLineToken: fn } = await import("@/lib/auth");

    // 最初の呼び出し
    await fn("ttl-token");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // 5分1秒後にタイムを進める
    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1000);

    await fn("ttl-token");
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

// ─────────────────────────────────────────────
// authenticateRequest
// ─────────────────────────────────────────────
describe("authenticateRequest", () => {
  const mockDbUser = makeDbUser();

  beforeEach(() => {
    vi.resetModules();

    const builder = createQueryBuilder({ data: mockDbUser, error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder as never);

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ userId: mockDbUser.line_user_id, displayName: mockDbUser.nickname }),
        { status: 200 }
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常な Bearer トークン → DbUser を返す", async () => {
    const { authenticateRequest: fn } = await import("@/lib/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer valid-token" },
    });
    const result = await fn(req);
    expect(result).toMatchObject({ id: mockDbUser.id });
  });

  it('"Bearer " プレフィックスがない → null', async () => {
    const { authenticateRequest: fn } = await import("@/lib/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "invalid-token" },
    });
    const result = await fn(req);
    expect(result).toBeNull();
  });

  it("Authorization ヘッダーなし → null", async () => {
    const { authenticateRequest: fn } = await import("@/lib/auth");
    const req = new Request("http://localhost/api/test");
    const result = await fn(req);
    expect(result).toBeNull();
  });

  it("LINE API が無効なトークンを返す → null", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 401 })
    );
    const { authenticateRequest: fn } = await import("@/lib/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer bad-token" },
    });
    const result = await fn(req);
    expect(result).toBeNull();
  });

  it("LINE では有効だが DB にユーザーなし → null", async () => {
    const builder = createQueryBuilder({ data: null, error: { code: "PGRST116" } });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder as never);

    const { authenticateRequest: fn } = await import("@/lib/auth");
    const req = new Request("http://localhost/api/test", {
      headers: { Authorization: "Bearer orphan-token" },
    });
    const result = await fn(req);
    expect(result).toBeNull();
  });
});
