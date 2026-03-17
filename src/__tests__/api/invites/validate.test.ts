import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "crypto";

// ── 環境変数セットアップ ──────────────────────────────
const VALID_CODE = "VALIDATE-TEST-CODE";
beforeAll(() => {
  process.env.INVITE_CODE_HASH = createHash("sha256").update(VALID_CODE).digest("hex");
});

function makeRequest(body: object, ip = "127.0.0.1") {
  return new Request("http://localhost/api/invites/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/invites/validate", () => {
  it("有効なコード → { valid: true }", async () => {
    const { POST } = await import("@/app/api/invites/validate/route");
    const res = await POST(makeRequest({ code: VALID_CODE }, "10.0.0.1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it("無効なコード → { valid: false }", async () => {
    const { POST } = await import("@/app/api/invites/validate/route");
    const res = await POST(makeRequest({ code: "WRONG-CODE" }, "10.0.0.2"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(false);
  });

  it("code なし → 400", async () => {
    const { POST } = await import("@/app/api/invites/validate/route");
    const res = await POST(makeRequest({}, "10.0.0.3"));
    expect(res.status).toBe(400);
  });

  it("前後の空白はトリムされる", async () => {
    const { POST } = await import("@/app/api/invites/validate/route");
    const res = await POST(makeRequest({ code: `  ${VALID_CODE}  ` }, "10.0.0.4"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.valid).toBe(true);
  });

  it("同一IPで 10 回を超えると 429", async () => {
    const { POST } = await import("@/app/api/invites/validate/route");
    const ip = "10.0.0.100";

    // 10回まで通過
    for (let i = 0; i < 10; i++) {
      const res = await POST(makeRequest({ code: "any" }, ip));
      expect(res.status).not.toBe(429);
    }

    // 11回目は 429
    const res = await POST(makeRequest({ code: "any" }, ip));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});
