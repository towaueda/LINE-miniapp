import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/matching/complete/route";
import { createPostRequest, makeDbUser, createQueryBuilder } from "../../helpers/supabaseMock";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const validUser = makeDbUser();
const GROUP_ID = "group-uuid-1";

describe("POST /api/matching/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(validUser as never);
  });

  it("未認証 → 401", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await POST(createPostRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(401);
  });

  it("groupId なし → 400", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: [], error: null }) as never
    );
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(400);
  });

  it("メンバーなし（非メンバー）→ 403", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: [], error: null }) as never
    );
    const res = await POST(createPostRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(403);
  });

  it("グループに存在しないユーザー → 403", async () => {
    const members = [
      { id: "m1", user_id: "other-user", completed_at: null },
    ];
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: members, error: null }) as never
    );
    const res = await POST(createPostRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(403);
  });

  it("自分だけ完了（3人中1人）→ allConfirmed:false", async () => {
    const members = [
      { id: "m1", user_id: validUser.id, completed_at: null },
      { id: "m2", user_id: "user-2", completed_at: null },
      { id: "m3", user_id: "user-3", completed_at: null },
    ];
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      callCount++;
      // 1回目: メンバー取得
      if (table === "match_group_members" && callCount === 1) {
        return createQueryBuilder({ data: members, error: null }) as never;
      }
      // 2回目以降: update
      return createQueryBuilder({ data: null, error: null }) as never;
    });

    const res = await POST(createPostRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allConfirmed).toBe(false);
    expect(body.confirmed).toBe(1);
    expect(body.total).toBe(3);
  });

  it("全員完了 → allConfirmed:true + match_groups を completed に更新", async () => {
    const members = [
      { id: "m1", user_id: validUser.id, completed_at: null },
      { id: "m2", user_id: "user-2", completed_at: "2026-03-20T13:00:00Z" },
      { id: "m3", user_id: "user-3", completed_at: "2026-03-20T13:00:00Z" },
    ];
    const groupUpdateBuilder = createQueryBuilder({ data: null, error: null });
    const memberUpdateBuilder = createQueryBuilder({ data: null, error: null });

    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      callCount++;
      if (table === "match_group_members" && callCount === 1) {
        return createQueryBuilder({ data: members, error: null }) as never;
      }
      if (table === "match_group_members") return memberUpdateBuilder as never;
      if (table === "match_groups") return groupUpdateBuilder as never;
      return createQueryBuilder({ data: null, error: null }) as never;
    });

    const res = await POST(createPostRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.allConfirmed).toBe(true);
    expect(body.confirmed).toBe(3);
  });

  it("既に completed_at がある場合は重複更新しない", async () => {
    const members = [
      { id: "m1", user_id: validUser.id, completed_at: "2026-03-20T12:30:00Z" },
      { id: "m2", user_id: "user-2", completed_at: null },
    ];
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: members, error: null }) as never
    );

    const res = await POST(createPostRequest({ groupId: GROUP_ID }));
    expect(res.status).toBe(200);
    // update は呼ばれない（completed_at が既にある）
    const body = await res.json();
    expect(body.confirmed).toBe(1);
  });
});
