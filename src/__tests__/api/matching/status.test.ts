import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/matching/status/route";
import {
  createGetRequest,
  makeDbUser,
  makeMatchGroup,
  createQueryBuilder,
} from "../../helpers/supabaseMock";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const validUser = makeDbUser();

/** supabaseAdmin.from の呼び出しパターンを設定するヘルパー */
function setupFromSequence(responses: Record<string, unknown>) {
  vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    const result = responses[table] ?? { data: null, error: null };
    return createQueryBuilder(result as never) as never;
  });
}

describe("GET /api/matching/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(validUser as never);
  });

  it("未認証 → 401", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await GET(createGetRequest());
    expect(res.status).toBe(401);
  });

  // ─── idle ─────────────────────────────────────
  it("マッチリクエストなし・アクティブグループなし → { status: 'idle' }", async () => {
    setupFromSequence({
      match_group_members: { data: [], error: null },
      match_requests: { data: null, error: { code: "PGRST116" } }, // no row
    });
    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("idle");
  });

  // ─── waiting ──────────────────────────────────
  it("waiting リクエストあり → { status: 'waiting', request }", async () => {
    const waitingReq = {
      id: "req-1",
      user_id: validUser.id,
      status: "waiting",
      area: "umeda",
      available_dates: ["2026-03-20"],
      updated_at: new Date().toISOString(),
    };
    setupFromSequence({
      match_group_members: { data: [], error: null },
      match_requests: { data: waitingReq, error: null },
    });
    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("waiting");
    expect(body.request).toBeDefined();
  });

  // ─── matched ──────────────────────────────────
  it("アクティブ（confirmed）グループあり → { status: 'matched', group, members }", async () => {
    const members = [
      { id: "u1", nickname: "A", birth_year: 1998, industry: "it", avatar_emoji: "😊", bio: "" },
      { id: "u2", nickname: "B", birth_year: 1999, industry: "finance", avatar_emoji: "😎", bio: "" },
    ];
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      callCount++;
      if (table === "match_group_members" && callCount === 1) {
        return createQueryBuilder({
          data: [{ group_id: "g1", match_groups: { id: "g1", status: "confirmed" } }],
          error: null,
        }) as never;
      }
      if (table === "match_requests") {
        return createQueryBuilder({ data: null, error: { code: "PGRST116" } }) as never;
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

    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("matched");
    expect(body.group).toBeDefined();
    expect(body.members).toBeDefined();
  });

  // ─── two_person_offered ───────────────────────
  it("two_person_offered → { status: 'two_person_offered', proposedDates }", async () => {
    const myDates = ["2026-03-20", "2026-03-27"];
    const partnerDates = ["2026-03-20", "2026-04-03"];

    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      callCount++;
      if (table === "match_group_members") {
        return createQueryBuilder({ data: [], error: null }) as never;
      }
      if (table === "match_requests" && callCount <= 2) {
        return createQueryBuilder({
          data: {
            id: "req-1",
            status: "two_person_offered",
            available_dates: myDates,
            two_person_partner_id: "req-2",
            updated_at: new Date().toISOString(),
          },
          error: null,
        }) as never;
      }
      if (table === "match_requests" && callCount > 2) {
        return createQueryBuilder({
          data: { available_dates: partnerDates },
          error: null,
        }) as never;
      }
      return createQueryBuilder({ data: null, error: null }) as never;
    });

    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("two_person_offered");
    expect(body.proposedDates).toContain("2026-03-20");
  });

  // ─── no_match ─────────────────────────────────
  it("no_match（7日以内）→ { status: 'no_match' }", async () => {
    setupFromSequence({
      match_group_members: { data: [], error: null },
      match_requests: {
        data: {
          id: "req-1",
          status: "no_match",
          updated_at: new Date().toISOString(), // 直近
        },
        error: null,
      },
    });
    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("no_match");
  });

  it("no_match（7日超）→ idle にフォールスルー", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    setupFromSequence({
      match_group_members: { data: [], error: null },
      match_requests: {
        data: {
          id: "req-1",
          status: "no_match",
          updated_at: eightDaysAgo,
        },
        error: null,
      },
    });
    const res = await GET(createGetRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("idle");
  });

  // ─── hasPendingReview フラグ ───────────────────
  it("completed グループに未レビューあり → hasPendingReview:true が付与", async () => {
    let callCount = 0;
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      callCount++;
      if (table === "match_group_members") {
        return createQueryBuilder({
          data: [{ group_id: "g1", match_groups: { id: "g1", status: "completed" } }],
          error: null,
        }) as never;
      }
      if (table === "reviews") {
        return createQueryBuilder({ data: null, error: null, count: 0 }) as never;
      }
      if (table === "match_requests") {
        return createQueryBuilder({ data: null, error: { code: "PGRST116" } }) as never;
      }
      return createQueryBuilder({ data: null, error: null }) as never;
    });

    const res = await GET(createGetRequest());
    const body = await res.json();
    expect(body.hasPendingReview).toBe(true);
  });
});
