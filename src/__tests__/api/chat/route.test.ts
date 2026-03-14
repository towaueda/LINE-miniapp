import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/chat/[groupId]/route";
import { makeDbUser, createQueryBuilder } from "../../helpers/supabaseMock";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const validUser = makeDbUser();
const GROUP_ID = "group-uuid-1";

function createGetRequest(url = `http://localhost/api/chat/${GROUP_ID}`): Request {
  return new Request(url, { method: "GET" });
}

const mockMessages = [
  {
    id: "msg-1",
    group_id: GROUP_ID,
    sender_id: validUser.id,
    sender_name: "テスト太郎",
    text: "こんにちは",
    is_system: false,
    created_at: "2026-03-20T12:00:00Z",
  },
  {
    id: "msg-2",
    group_id: GROUP_ID,
    sender_id: null,
    sender_name: "システム",
    text: "マッチング成立！",
    is_system: true,
    created_at: "2026-03-20T11:00:00Z",
  },
];

describe("GET /api/chat/[groupId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(validUser as never);
  });

  it("未認証 → 401", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await GET(createGetRequest(), { params: { groupId: GROUP_ID } });
    expect(res.status).toBe(401);
  });

  it("非メンバー → 403", async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      // membership チェック → null（メンバーでない）
      if (table === "match_group_members") return createQueryBuilder({ data: null, error: null }) as never;
      return createQueryBuilder({ data: mockMessages, error: null }) as never;
    });

    const res = await GET(createGetRequest(), { params: { groupId: GROUP_ID } });
    expect(res.status).toBe(403);
  });

  it("正常: メッセージ一覧を昇順で返す", async () => {
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      callCount++;
      if (table === "match_group_members") {
        return createQueryBuilder({ data: { id: "member-1" }, error: null }) as never;
      }
      // messages: limit+1 件を返す（hasMore チェック用）
      return createQueryBuilder({ data: mockMessages, error: null }) as never;
    });

    const res = await GET(createGetRequest(), { params: { groupId: GROUP_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toBeDefined();
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
    // 昇順に並んでいるか確認（古いメッセージが先）
    if (body.messages.length >= 2) {
      expect(body.messages[0].created_at <= body.messages[1].created_at).toBe(true);
    }
  });

  it("ページネーション: limit+1 件返ってきた場合 hasMore:true", async () => {
    // DEFAULT_LIMIT=50 なので 51 件を返すようにする
    const manyMessages = Array.from({ length: 51 }, (_, i) => ({
      ...mockMessages[0],
      id: `msg-${i}`,
      created_at: `2026-03-20T${String(i).padStart(2, "0")}:00:00Z`,
    }));

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "match_group_members") {
        return createQueryBuilder({ data: { id: "member-1" }, error: null }) as never;
      }
      return createQueryBuilder({ data: manyMessages, error: null }) as never;
    });

    const res = await GET(createGetRequest(), { params: { groupId: GROUP_ID } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).not.toBeNull();
    expect(body.messages).toHaveLength(50); // limit 件のみ
  });

  it("before パラメータ付き → カーソルページネーション", async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "match_group_members") {
        return createQueryBuilder({ data: { id: "member-1" }, error: null }) as never;
      }
      return createQueryBuilder({ data: [mockMessages[1]], error: null }) as never;
    });

    const url = `http://localhost/api/chat/${GROUP_ID}?before=2026-03-20T12:00:00Z`;
    const res = await GET(createGetRequest(url), { params: { groupId: GROUP_ID } });
    expect(res.status).toBe(200);
  });

  it("DB エラー → 500", async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "match_group_members") {
        return createQueryBuilder({ data: { id: "member-1" }, error: null }) as never;
      }
      return createQueryBuilder({ data: null, error: { message: "db error" } }) as never;
    });

    const res = await GET(createGetRequest(), { params: { groupId: GROUP_ID } });
    expect(res.status).toBe(500);
  });
});
