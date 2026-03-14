import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/matching/two-person-response/route";
import { createPostRequest, makeDbUser, makeMatchGroup, createQueryBuilder } from "../../helpers/supabaseMock";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));

import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const validUser = makeDbUser();

const twoPersonReq = {
  id: "req-1",
  user_id: validUser.id,
  status: "two_person_offered",
  area: "umeda",
  available_dates: ["2026-03-20"],
  two_person_partner_id: "req-2",
};

describe("POST /api/matching/two-person-response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(validUser as never);
  });

  // ─── 認証・権限チェック ────────────────────────
  it("未認証 → 401", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await POST(createPostRequest({ action: "accept" }));
    expect(res.status).toBe(401);
  });

  it("is_approved=false → 403", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(
      makeDbUser({ is_approved: false }) as never
    );
    const res = await POST(createPostRequest({ action: "accept" }));
    expect(res.status).toBe(403);
  });

  it("is_banned=true → 403", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(
      makeDbUser({ is_banned: true }) as never
    );
    const res = await POST(createPostRequest({ action: "accept" }));
    expect(res.status).toBe(403);
  });

  // ─── 入力バリデーション ────────────────────────
  it("無効な action → 400", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: twoPersonReq, error: null }) as never
    );
    const res = await POST(createPostRequest({ action: "maybe" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/無効/);
  });

  it("two_person_offered リクエストなし → 404", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: null, error: { code: "PGRST116" } }) as never
    );
    const res = await POST(createPostRequest({ action: "accept" }));
    expect(res.status).toBe(404);
  });

  // ─── accept ───────────────────────────────────
  it("accept: パートナーが未承諾 → { status: 'waiting_for_partner' }", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: twoPersonReq, error: null }) as never
    );
    // confirm_two_person_match RPC → null（パートナー未承諾）
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as never);

    const res = await POST(createPostRequest({ action: "accept" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("waiting_for_partner");
  });

  it("accept: 両者承諾済み → { status: 'matched', group, members }", async () => {
    const GROUP_ID = "group-uuid-1";
    const members = [
      { id: "u1", nickname: "A", birth_year: 1998, industry: "it", avatar_emoji: "😊", bio: "" },
      { id: "u2", nickname: "B", birth_year: 1999, industry: "finance", avatar_emoji: "😎", bio: "" },
    ];

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "match_requests") {
        return createQueryBuilder({ data: twoPersonReq, error: null }) as never;
      }
      if (table === "match_groups") {
        return createQueryBuilder({
          data: {
            ...makeMatchGroup(),
            match_group_members: members.map((m) => ({ users: m })),
          },
          error: null,
        }) as never;
      }
      return createQueryBuilder({ data: null, error: null }) as never;
    });
    // confirm_two_person_match RPC → groupId（両者承諾）
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: GROUP_ID, error: null } as never);

    const res = await POST(createPostRequest({ action: "accept" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("matched");
    expect(body.group).toBeDefined();
    expect(body.members).toBeDefined();
  });

  it("accept: RPC エラー → 500", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: twoPersonReq, error: null }) as never
    );
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: null,
      error: { message: "rpc error" },
    } as never);

    const res = await POST(createPostRequest({ action: "accept" }));
    expect(res.status).toBe(500);
  });

  // ─── decline ──────────────────────────────────
  it("decline → { status: 'no_match' }", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: twoPersonReq, error: null }) as never
    );
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as never);

    const res = await POST(createPostRequest({ action: "decline" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("no_match");
  });

  it("decline: RPC エラー → 500", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: twoPersonReq, error: null }) as never
    );
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({
      data: null,
      error: { message: "rpc error" },
    } as never);

    const res = await POST(createPostRequest({ action: "decline" }));
    expect(res.status).toBe(500);
  });
});
