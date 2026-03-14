import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/invites/validate/route";
import { createPostRequest } from "../../helpers/supabaseMock";
import { createHash } from "crypto";

const TEST_CODE = "TRI-MASTER-2026";
const TEST_HASH = createHash("sha256").update(TEST_CODE).digest("hex");

describe("POST /api/invites/validate", () => {
  beforeEach(() => {
    process.env.INVITE_CODE_HASH = TEST_HASH;
  });

  it("ハッシュが一致するコード → { valid: true }", async () => {
    const res = await POST(createPostRequest({ code: TEST_CODE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it("前後スペースをtrimして一致 → { valid: true }", async () => {
    const res = await POST(createPostRequest({ code: `  ${TEST_CODE}  ` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it("ハッシュが不一致のコード → { valid: false }", async () => {
    const res = await POST(createPostRequest({ code: "WRONG-CODE" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("code なし → 400", async () => {
    const res = await POST(createPostRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/code/);
  });

  it("INVITE_CODE_HASH 未設定の場合 → { valid: false }（全コード不一致）", async () => {
    delete process.env.INVITE_CODE_HASH;
    const res = await POST(createPostRequest({ code: TEST_CODE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });
});
