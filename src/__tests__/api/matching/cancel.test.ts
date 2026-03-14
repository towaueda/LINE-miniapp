import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/matching/cancel/route";
import { createPostRequest, makeDbUser, createQueryBuilder } from "../../helpers/supabaseMock";

vi.mock("@/lib/auth", () => ({ authenticateRequest: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const validUser = makeDbUser();

describe("POST /api/matching/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticateRequest).mockResolvedValue(validUser as never);
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: null, error: null }) as never
    );
  });

  it("未認証 → 401", async () => {
    vi.mocked(authenticateRequest).mockResolvedValue(null);
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(401);
  });

  it("正常: waiting リクエストをキャンセル → 200 + { success: true }", async () => {
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("DB エラー → 500", async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue(
      createQueryBuilder({ data: null, error: { message: "db error" } }) as never
    );
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(500);
  });
});
