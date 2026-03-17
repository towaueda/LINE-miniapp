import { describe, it, expect, vi, beforeEach } from "vitest";

// ── モック ────────────────────────────────────────────
const mockAuthenticateRequest = vi.fn();
vi.mock("@/lib/auth", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
}));

const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockCollectionGet = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: vi.fn(() => ({
      where: vi.fn().mockReturnThis(),
      get: mockCollectionGet,
      batch: vi.fn(),
    })),
    batch: () => ({ update: mockBatchUpdate, commit: mockBatchCommit }),
  },
}));

function makeRequest() {
  return new Request("http://localhost/api/matching/cancel", {
    method: "POST",
    headers: { Authorization: "Bearer token" },
  });
}

function makeSnap(docs: Array<{ id: string }>) {
  return {
    empty: docs.length === 0,
    docs: docs.map((d) => ({
      id: d.id,
      ref: { update: vi.fn() },
      data: () => d,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBatchCommit.mockResolvedValue(undefined);
});

describe("POST /api/matching/cancel", () => {
  it("未認証 → 401", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);
    const { POST } = await import("@/app/api/matching/cancel/route");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("waiting リクエストなし → success: true", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockCollectionGet.mockResolvedValue(makeSnap([]));

    const { POST } = await import("@/app/api/matching/cancel/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("waiting リクエストあり → cancelled に更新・success: true", async () => {
    mockAuthenticateRequest.mockResolvedValue({ id: "u1" });
    mockCollectionGet.mockResolvedValue(makeSnap([{ id: "req-1" }, { id: "req-2" }]));

    const { POST } = await import("@/app/api/matching/cancel/route");
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "cancelled" })
    );
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});
