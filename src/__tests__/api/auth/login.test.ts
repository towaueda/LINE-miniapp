import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/login/route";
import { createPostRequest, makeDbUser, createQueryBuilder } from "../../helpers/supabaseMock";
import { createHash } from "crypto";

// モック設定
vi.mock("@/lib/auth", () => ({
  verifyLineToken: vi.fn(),
  getOrCreateUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { verifyLineToken, getOrCreateUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// テスト用招待コードとそのSHA-256ハッシュ
const TEST_INVITE_CODE = "TEST-MASTER-CODE";
const TEST_INVITE_HASH = createHash("sha256").update(TEST_INVITE_CODE).digest("hex");

describe("POST /api/auth/login", () => {
  const mockUser = makeDbUser({ is_approved: false });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INVITE_CODE_HASH = TEST_INVITE_HASH;
  });

  // ─── 認証エラー ───────────────────────────────
  it("accessToken なし → 400", async () => {
    const req = createPostRequest({ inviteCode: "code" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/accessToken/);
  });

  it("無効な LINE トークン → 401", async () => {
    vi.mocked(verifyLineToken).mockResolvedValue(null);
    const req = createPostRequest({ accessToken: "bad-token" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("ユーザー作成失敗（DB エラー）→ 500", async () => {
    vi.mocked(verifyLineToken).mockResolvedValue({ userId: "Uline1", displayName: "テスト" });
    vi.mocked(getOrCreateUser).mockResolvedValue(null);
    const req = createPostRequest({ accessToken: "valid-token" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("BAN されたユーザー → 403", async () => {
    vi.mocked(verifyLineToken).mockResolvedValue({ userId: "Uline1", displayName: "テスト" });
    vi.mocked(getOrCreateUser).mockResolvedValue(makeDbUser({ is_banned: true }) as never);
    const req = createPostRequest({ accessToken: "valid-token" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/banned/);
  });

  // ─── 正常系 ───────────────────────────────────
  it("正常: 新規ユーザー → 200 + user 返却", async () => {
    vi.mocked(verifyLineToken).mockResolvedValue({ userId: "Uline1", displayName: "テスト" });
    vi.mocked(getOrCreateUser).mockResolvedValue(mockUser as never);
    const req = createPostRequest({ accessToken: "valid-token" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(mockUser.id);
  });

  it("既存ユーザー（承認済み）→ 200 + user 返却（招待コードを再検証しない）", async () => {
    const approvedUser = makeDbUser({ is_approved: true });
    vi.mocked(verifyLineToken).mockResolvedValue({ userId: "Uline1", displayName: "テスト" });
    vi.mocked(getOrCreateUser).mockResolvedValue(approvedUser as never);
    const req = createPostRequest({ accessToken: "valid-token", inviteCode: "some-code" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // DB update が呼ばれないことを確認
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  // ─── 招待コード検証 ───────────────────────────
  it("ハッシュが一致する招待コード + 未承認 → is_approved=true に更新して返す", async () => {
    vi.mocked(verifyLineToken).mockResolvedValue({ userId: "Uline1", displayName: "テスト" });
    vi.mocked(getOrCreateUser).mockResolvedValue(mockUser as never);

    const builder = createQueryBuilder({ data: null, error: null });
    vi.mocked(supabaseAdmin.from).mockReturnValue(builder as never);

    const req = createPostRequest({ accessToken: "valid-token", inviteCode: TEST_INVITE_CODE });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.is_approved).toBe(true);
    // DBのupdateが呼ばれたことを確認
    expect(supabaseAdmin.from).toHaveBeenCalledWith("users");
  });

  it("ハッシュが不一致の招待コード → is_approved 更新なし", async () => {
    vi.mocked(verifyLineToken).mockResolvedValue({ userId: "Uline1", displayName: "テスト" });
    vi.mocked(getOrCreateUser).mockResolvedValue(mockUser as never);

    const req = createPostRequest({ accessToken: "valid-token", inviteCode: "WRONG-CODE" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    // is_approved は変わらず false のまま
    expect(body.user.is_approved).toBe(false);
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
