import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/chat/[groupId]/send/route";
import { createPostRequest, makeDbUser, createQueryBuilder } from "../../helpers/supabaseMock";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const validUser = makeDbUser();
const GROUP_ID = "group-uuid-1";

/** グループ情報とメンバーシップを正常系でセットアップ */
function setupNormalGroup(overrides: { date?: string; status?: string } = {}) {
  const group = {
    status: overrides.status ?? "confirmed",
    date: overrides.date ?? "2099-12-31", // 十分未来の日付
  };
  const membership = { id: "member-1" };
  const message = {
    id: "msg-1",
    group_id: GROUP_ID,
    sender_id: validUser.id,
    sender_name: validUser.nickname,
    text: "こんにちは",
    is_system: false,
    created_at: new Date().toISOString(),
  };

  vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    if (table === "match_group_members") {
      return createQueryBuilder({ data: membership, error: null }) as never;
    }
    if (table === "match_groups") {
      return createQueryBuilder({ data: group, error: null }) as never;
    }
    if (table === "messages") {
      return createQueryBuilder({ data: message, error: null }) as never;
    }
    return createQueryBuilder({ data: null, error: null }) as never;
  });
}

describe("POST /api/chat/[groupId]/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(validUser as never);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 認証チェック ──────────────────────────────
  it("未認証 → 401", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await POST(createPostRequest({ text: "hello" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(401);
  });

  // ─── メンバーシップチェック ────────────────────
  it("非メンバー → 403", async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "match_group_members") {
        return createQueryBuilder({ data: null, error: null }) as never;
      }
      return createQueryBuilder({ data: { status: "confirmed", date: "2099-12-31" }, error: null }) as never;
    });

    const res = await POST(createPostRequest({ text: "hello" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/メンバー/);
  });

  it("グループが存在しない → 404", async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "match_group_members") {
        return createQueryBuilder({ data: { id: "member-1" }, error: null }) as never;
      }
      // match_groups が null
      return createQueryBuilder({ data: null, error: null }) as never;
    });

    const res = await POST(createPostRequest({ text: "hello" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(404);
  });

  // ─── グループステータスチェック ────────────────
  it("status=completed → 403", async () => {
    setupNormalGroup({ status: "completed" });
    const res = await POST(createPostRequest({ text: "hello" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/終了/);
  });

  it("status=cancelled → 403", async () => {
    setupNormalGroup({ status: "cancelled" });
    const res = await POST(createPostRequest({ text: "hello" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(403);
  });

  // ─── チャット期限チェック ──────────────────────
  it("マッチ日の23:59:59 JST 経過後 → 403", async () => {
    // 昨日の日付でグループを設定
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split("T")[0];

    setupNormalGroup({ date: dateStr });

    // 現在時刻を今日の00:01にセット（昨日23:59を過ぎている）
    vi.setSystemTime(new Date("2026-03-21T00:01:00+09:00"));

    const res = await POST(createPostRequest({ text: "hello" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/期限/);
  });

  // ─── メッセージバリデーション ──────────────────
  it("空文字メッセージ → 400", async () => {
    setupNormalGroup();
    const res = await POST(createPostRequest({ text: "" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(400);
  });

  it("空白のみ → 400", async () => {
    setupNormalGroup();
    const res = await POST(createPostRequest({ text: "   " }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(400);
  });

  it("1001文字 → 400", async () => {
    setupNormalGroup();
    const res = await POST(createPostRequest({ text: "A".repeat(1001) }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(400);
  });

  // ─── 正常系 ───────────────────────────────────
  it("正常なメッセージ → 200 + message 返却", async () => {
    setupNormalGroup();
    const res = await POST(createPostRequest({ text: "こんにちは" }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBeDefined();
    expect(body.message.text).toBe("こんにちは");
  });

  it("1000文字メッセージ（上限）→ 200", async () => {
    setupNormalGroup();
    const res = await POST(createPostRequest({ text: "A".repeat(1000) }), {
      params: { groupId: GROUP_ID },
    });
    expect(res.status).toBe(200);
  });
});
