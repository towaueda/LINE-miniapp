import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/matching/request/route";
import {
  createPostRequest,
  makeDbUser,
  makeMatchGroup,
  createQueryBuilder,
  setupFromMock,
} from "../../helpers/supabaseMock";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock("@/lib/matching", () => ({ tryMatch: vi.fn() }));

import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { tryMatch } from "@/lib/matching";

// 未来の木曜日を取得
function nextThursday(weeksAhead = 1): string {
  const now = new Date();
  const day = now.getDay();
  const diff = ((4 - day + 7) % 7) + 7 * (weeksAhead - 1) || 7;
  const d = new Date(now);
  d.setDate(now.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const validUser = makeDbUser();
const VALID_AREA = "umeda";
const VALID_DATES = [nextThursday(1), nextThursday(2)];

/** Promise.all 内の複数 from 呼び出しに対応したセットアップ */
function setupMatchingMocks({
  memberGroups = [],
  reviewCount = 0,
}: {
  memberGroups?: unknown[];
  reviewCount?: number;
} = {}) {
  // rpc("expire_old_match_requests") → void
  vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as never);

  let callCount = 0;
  vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    callCount++;
    // match_group_members（pending review チェック）
    if (table === "match_group_members") {
      return createQueryBuilder({ data: memberGroups, error: null }) as never;
    }
    // reviews（pending review count チェック）
    if (table === "reviews") {
      return createQueryBuilder({ data: null, error: null, count: reviewCount }) as never;
    }
    // match_requests（既存waiting cancel / 新規insert）
    if (table === "match_requests") {
      return createQueryBuilder({
        data: { id: "req-uuid-1", user_id: validUser.id, area: VALID_AREA, available_dates: VALID_DATES, status: "waiting" },
        error: null,
      }) as never;
    }
    // match_groups（グループ取得）
    if (table === "match_groups") {
      return createQueryBuilder({
        data: { ...makeMatchGroup(), match_group_members: [] },
        error: null,
      }) as never;
    }
    return createQueryBuilder({ data: null, error: null }) as never;
  });
}

describe("POST /api/matching/request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(validUser as never);
    vi.mocked(tryMatch).mockResolvedValue(null);
    setupMatchingMocks();
  });

  // ─── 認証・権限チェック ────────────────────────
  it("未認証 → 401", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    expect(res.status).toBe(401);
  });

  it("is_approved=false → 403", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(
      makeDbUser({ is_approved: false }) as never
    );
    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/未承認/);
  });

  it("is_banned=true → 403", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(
      makeDbUser({ is_banned: true }) as never
    );
    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/停止/);
  });

  it("プロフィール未完成（nickname なし）→ 400", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(
      makeDbUser({ nickname: null }) as never
    );
    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/プロフィール/);
  });

  // ─── 入力バリデーション ────────────────────────
  it("無効なエリア → 400", async () => {
    const res = await POST(createPostRequest({ area: "tokyo", dates: VALID_DATES }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/エリア/);
  });

  it("木曜日以外の日付 → 400", async () => {
    const monday = (() => {
      const d = new Date();
      const diff = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split("T")[0];
    })();
    const res = await POST(createPostRequest({ area: VALID_AREA, dates: [monday] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/木曜日/);
  });

  it("9件以上の日付 → 400", async () => {
    const dates = Array.from({ length: 9 }, (_, i) => nextThursday(i + 1));
    const res = await POST(createPostRequest({ area: VALID_AREA, dates }));
    expect(res.status).toBe(400);
  });

  it("空の日付配列 → 400", async () => {
    const res = await POST(createPostRequest({ area: VALID_AREA, dates: [] }));
    expect(res.status).toBe(400);
  });

  // ─── レビュー未完了チェック ────────────────────
  it("completed グループに未レビューあり → 400 + hasPendingReview:true", async () => {
    setupMatchingMocks({
      memberGroups: [
        { group_id: "g1", match_groups: { id: "g1", status: "completed" } },
      ],
      reviewCount: 0, // レビューなし
    });

    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.hasPendingReview).toBe(true);
  });

  it("completed グループに全レビュー済み → 通過してマッチング試行", async () => {
    setupMatchingMocks({
      memberGroups: [
        { group_id: "g1", match_groups: { id: "g1", status: "completed" } },
      ],
      reviewCount: 2, // レビューあり
    });

    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    // waiting か matched のいずれか（マッチしない場合はwaiting）
    expect([200]).toContain(res.status);
    const body = await res.json();
    expect(["waiting", "matched"]).toContain(body.status);
  });

  // ─── マッチング結果 ─────────────────────────────
  it("tryMatch が null → { status: 'waiting' }", async () => {
    vi.mocked(tryMatch).mockResolvedValue(null);
    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("waiting");
    expect(body.request).toBeDefined();
  });

  it("tryMatch がgroupId → { status: 'matched', group, members }", async () => {
    vi.mocked(tryMatch).mockResolvedValue("group-uuid-1");
    const members = [
      { id: "u1", nickname: "A", birth_year: 1998, industry: "it", avatar_emoji: "😊", bio: "" },
      { id: "u2", nickname: "B", birth_year: 1999, industry: "finance", avatar_emoji: "😎", bio: "" },
      { id: "u3", nickname: "C", birth_year: 2000, industry: "media", avatar_emoji: "🤗", bio: "" },
    ];
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === "match_group_members") {
        return createQueryBuilder({ data: [], error: null }) as never;
      }
      if (table === "match_requests") {
        return createQueryBuilder({
          data: { id: "req-1", user_id: validUser.id, area: VALID_AREA, available_dates: VALID_DATES, status: "waiting" },
          error: null,
        }) as never;
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
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: null, error: null } as never);

    const res = await POST(createPostRequest({ area: VALID_AREA, dates: VALID_DATES }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("matched");
    expect(body.group).toBeDefined();
    expect(body.members).toBeDefined();
  });
});
