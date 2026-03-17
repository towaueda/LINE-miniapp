import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Firestore モック ──────────────────────────────────
const mockTxGet = vi.fn();
const mockTxSet = vi.fn();
const mockTxUpdate = vi.fn();
const mockRunTransaction = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

// collection チェーンを動的に制御するため Map で管理
const collectionGetMocks: Record<string, ReturnType<typeof vi.fn>> = {};

function makeDocRef(id: string) {
  return { id, update: mockTxUpdate };
}

function makeDocSnap(data: Record<string, unknown> | null, id = "doc-id") {
  return { exists: data !== null, id, data: () => data ?? undefined, ref: makeDocRef(id) };
}

function makeSnap(docs: Array<{ id: string; [key: string]: unknown }>) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    docs: docs.map((d) => ({
      id: d.id,
      data: () => d,
      ref: makeDocRef(d.id),
    })),
  };
}

const mockDocGet = vi.fn();
const mockCollectionRef = {
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  get: vi.fn(),
  doc: vi.fn((id?: string) => ({
    id: id ?? "new-doc-id",
    get: mockDocGet,
    update: mockTxUpdate,
  })),
  add: vi.fn(),
};

const mockCollection = vi.fn(() => mockCollectionRef);
const mockNewDocRef = { id: "new-group-id", update: mockTxUpdate };

vi.mock("@/lib/firebase/admin", () => ({
  adminDb: {
    collection: mockCollection,
    batch: () => ({
      update: mockBatchUpdate,
      set: vi.fn(),
      commit: mockBatchCommit,
    }),
    runTransaction: mockRunTransaction,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockBatchCommit.mockResolvedValue(undefined);
  mockCollectionRef.where.mockReturnThis();
  mockCollectionRef.orderBy.mockReturnThis();
  mockCollectionRef.limit.mockReturnThis();
  mockCollectionRef.doc.mockReturnValue({
    id: "new-doc-id",
    get: mockDocGet,
    update: mockTxUpdate,
  });
  mockCollectionRef.add.mockResolvedValue({ id: "new-added-id" });
});

// ── tryMatch ──────────────────────────────────────────
describe("tryMatch", () => {
  it("新規リクエストが存在しない → null を返す", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet.mockResolvedValueOnce(makeDocSnap(null));
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { tryMatch } = await import("@/lib/matching");
    const result = await tryMatch("req-nonexistent");
    expect(result).toBeNull();
  });

  it("リクエストが waiting でない → null を返す", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet.mockResolvedValueOnce(
        makeDocSnap({ status: "matched", area: "umeda", available_dates: ["2026-04-03"] }, "req-1")
      );
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { tryMatch } = await import("@/lib/matching");
    const result = await tryMatch("req-1");
    expect(result).toBeNull();
  });

  it("同エリア waiting が2件未満 → null を返す（マッチング不成立）", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet.mockResolvedValueOnce(
        makeDocSnap({ status: "waiting", area: "umeda", available_dates: ["2026-04-03"] }, "req-1")
      );
      // waiting 候補が1件のみ（自分以外）
      mockCollectionRef.get.mockResolvedValueOnce(
        makeSnap([{ id: "req-2", status: "waiting", area: "umeda", available_dates: ["2026-04-03"] }])
      );
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { tryMatch } = await import("@/lib/matching");
    const result = await tryMatch("req-1");
    expect(result).toBeNull();
  });

  it("3人揃うが共通日程なし → null を返す", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet.mockResolvedValueOnce(
        makeDocSnap({ status: "waiting", area: "umeda", available_dates: ["2026-04-03"] }, "req-1")
      );
      mockCollectionRef.get.mockResolvedValueOnce(
        makeSnap([
          { id: "req-2", status: "waiting", area: "umeda", available_dates: ["2026-04-03"] },
          { id: "req-3", status: "waiting", area: "umeda", available_dates: ["2026-04-10"] },
        ])
      );
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { tryMatch } = await import("@/lib/matching");
    const result = await tryMatch("req-1");
    expect(result).toBeNull();
  });

  it("3人揃って共通日程あり → グループ作成・グループIDを返す", async () => {
    let capturedTx: { get: typeof mockTxGet; set: typeof mockTxSet; update: typeof mockTxUpdate } | null = null;

    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      capturedTx = { get: mockTxGet, set: mockTxSet, update: mockTxUpdate };
      mockTxGet.mockResolvedValueOnce(
        makeDocSnap({ status: "waiting", area: "umeda", available_dates: ["2026-04-03", "2026-04-10"] }, "req-1")
      );
      mockCollectionRef.get.mockResolvedValueOnce(
        makeSnap([
          { id: "req-2", status: "waiting", area: "umeda", available_dates: ["2026-04-03"] },
          { id: "req-3", status: "waiting", area: "umeda", available_dates: ["2026-04-03", "2026-04-17"] },
        ])
      );
      // collection("match_groups").doc() のモック
      mockCollectionRef.doc.mockReturnValue({ id: "new-group-id", update: mockTxUpdate });
      // collection("match_group_members").doc() のモック
      const result = await cb(capturedTx);
      return result;
    });

    const { tryMatch } = await import("@/lib/matching");
    const result = await tryMatch("req-1");

    expect(result).toBe("new-group-id");
    expect(mockTxSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-group-id" }),
      expect.objectContaining({ area: "umeda", date: "2026-04-03", status: "pending" })
    );
    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "matched", matched_group_id: "new-group-id" })
    );
  });
});

// ── offerTwoPersonMatches ─────────────────────────────
describe("offerTwoPersonMatches", () => {
  it("waiting リクエストがない → 0 を返す", async () => {
    mockCollectionRef.get.mockResolvedValueOnce(makeSnap([]));

    const { offerTwoPersonMatches } = await import("@/lib/matching");
    const result = await offerTwoPersonMatches();
    expect(result).toBe(0);
  });

  it("同エリアで日程が重なる2人 → オファーを送り 1 を返す", async () => {
    mockCollectionRef.get.mockResolvedValueOnce(
      makeSnap([
        { id: "req-a", status: "waiting", area: "namba", available_dates: ["2026-04-03"] },
        { id: "req-b", status: "waiting", area: "namba", available_dates: ["2026-04-03", "2026-04-10"] },
      ])
    );

    const { offerTwoPersonMatches } = await import("@/lib/matching");
    const result = await offerTwoPersonMatches();

    expect(result).toBe(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "two_person_offered", two_person_partner_id: "req-b" })
    );
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "two_person_offered", two_person_partner_id: "req-a" })
    );
  });

  it("エリアが異なる → オファーしない", async () => {
    mockCollectionRef.get.mockResolvedValueOnce(
      makeSnap([
        { id: "req-a", status: "waiting", area: "umeda", available_dates: ["2026-04-03"] },
        { id: "req-b", status: "waiting", area: "namba", available_dates: ["2026-04-03"] },
      ])
    );

    const { offerTwoPersonMatches } = await import("@/lib/matching");
    const result = await offerTwoPersonMatches();

    expect(result).toBe(0);
  });
});

// ── confirmTwoPersonMatch ─────────────────────────────
describe("confirmTwoPersonMatch", () => {
  it("リクエストが two_person_offered でない → null を返す", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet.mockResolvedValueOnce(
        makeDocSnap({ status: "waiting", area: "umeda" }, "req-1")
      );
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { confirmTwoPersonMatch } = await import("@/lib/matching");
    const result = await confirmTwoPersonMatch("req-1");
    expect(result).toBeNull();
  });

  it("相手がまだ offered → 自分を accepted に更新・null を返す", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet
        .mockResolvedValueOnce(
          makeDocSnap(
            { status: "two_person_offered", area: "umeda", available_dates: ["2026-04-03"], two_person_partner_id: "req-2" },
            "req-1"
          )
        )
        .mockResolvedValueOnce(
          makeDocSnap({ status: "two_person_offered", area: "umeda", available_dates: ["2026-04-03"] }, "req-2")
        );
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { confirmTwoPersonMatch } = await import("@/lib/matching");
    const result = await confirmTwoPersonMatch("req-1");

    expect(result).toBeNull();
    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "two_person_accepted" })
    );
  });

  it("相手が accepted 済み → 両者グループ作成・グループIDを返す", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet
        .mockResolvedValueOnce(
          makeDocSnap(
            { status: "two_person_offered", area: "namba", available_dates: ["2026-04-03"], two_person_partner_id: "req-2" },
            "req-1"
          )
        )
        .mockResolvedValueOnce(
          makeDocSnap(
            { status: "two_person_accepted", area: "namba", available_dates: ["2026-04-03"], user_id: "u2" },
            "req-2"
          )
        );
      mockCollectionRef.doc.mockReturnValue({ id: "group-2p", update: mockTxUpdate });
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { confirmTwoPersonMatch } = await import("@/lib/matching");
    const result = await confirmTwoPersonMatch("req-1");

    expect(result).toBe("group-2p");
    expect(mockTxSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "group-2p" }),
      expect.objectContaining({ area: "namba", date: "2026-04-03", status: "pending" })
    );
  });
});

// ── declineTwoPersonMatch ─────────────────────────────
describe("declineTwoPersonMatch", () => {
  it("自分と相手を no_match に更新する", async () => {
    mockRunTransaction.mockImplementation(async (cb: (tx: object) => Promise<unknown>) => {
      mockTxGet.mockResolvedValueOnce(
        makeDocSnap(
          { status: "two_person_offered", two_person_partner_id: "req-partner" },
          "req-self"
        )
      );
      return cb({ get: mockTxGet, set: mockTxSet, update: mockTxUpdate });
    });

    const { declineTwoPersonMatch } = await import("@/lib/matching");
    await declineTwoPersonMatch("req-self");

    expect(mockTxUpdate).toHaveBeenCalledTimes(2);
    expect(mockTxUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "no_match" })
    );
  });
});

// ── expireOldMatchRequests ────────────────────────────
describe("expireOldMatchRequests", () => {
  it("期限切れ waiting リクエストを expired に更新する", async () => {
    mockCollectionRef.get.mockResolvedValueOnce(
      makeSnap([
        { id: "req-old-1", status: "waiting" },
        { id: "req-old-2", status: "waiting" },
      ])
    );

    const { expireOldMatchRequests } = await import("@/lib/matching");
    await expireOldMatchRequests();

    expect(mockBatchUpdate).toHaveBeenCalledTimes(2);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "expired" })
    );
    expect(mockBatchCommit).toHaveBeenCalled();
  });

  it("期限切れリクエストがない → batch.commit は呼ばれる（空でも）", async () => {
    mockCollectionRef.get.mockResolvedValueOnce(makeSnap([]));

    const { expireOldMatchRequests } = await import("@/lib/matching");
    await expireOldMatchRequests();

    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});

// ── expireNoMatchRequests ─────────────────────────────
describe("expireNoMatchRequests", () => {
  it("7日以上前の no_match を expired に更新し件数を返す", async () => {
    mockCollectionRef.get.mockResolvedValueOnce(
      makeSnap([{ id: "req-nm-1", status: "no_match" }])
    );

    const { expireNoMatchRequests } = await import("@/lib/matching");
    const count = await expireNoMatchRequests();

    expect(count).toBe(1);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "expired" })
    );
  });
});

// ── getGroupWithMembers ───────────────────────────────
describe("getGroupWithMembers", () => {
  it("グループが存在しない → null を返す", async () => {
    mockCollectionRef.doc.mockReturnValue({
      id: "g-nonexistent",
      get: vi.fn().mockResolvedValue(makeDocSnap(null)),
    });
    mockCollectionRef.get.mockResolvedValueOnce(makeSnap([]));

    const { getGroupWithMembers } = await import("@/lib/matching");
    const result = await getGroupWithMembers("g-nonexistent");

    expect(result).toBeNull();
  });

  it("グループとメンバーを返す", async () => {
    const groupData = { area: "umeda", date: "2026-04-03", status: "pending" };
    const membersDocs = [
      { id: "m1", group_id: "g1", user_id: "u1" },
      { id: "m2", group_id: "g1", user_id: "u2" },
    ];
    const userDocs = [
      { id: "u1", nickname: "太郎", birth_year: 2000, industry: "it", avatar_emoji: "😀", bio: "" },
      { id: "u2", nickname: "花子", birth_year: 1998, industry: "finance", avatar_emoji: "🌸", bio: "よろしく" },
    ];

    mockCollectionRef.doc.mockImplementation((id?: string) => ({
      id: id ?? "g1",
      get: vi.fn().mockImplementation(() => {
        if (id === "u1") return Promise.resolve(makeDocSnap(userDocs[0], "u1"));
        if (id === "u2") return Promise.resolve(makeDocSnap(userDocs[1], "u2"));
        return Promise.resolve(makeDocSnap(groupData, "g1"));
      }),
    }));
    mockCollectionRef.get.mockResolvedValueOnce(makeSnap(membersDocs));

    const { getGroupWithMembers } = await import("@/lib/matching");
    const result = await getGroupWithMembers("g1");

    expect(result).not.toBeNull();
    expect(result?.group).toMatchObject({ area: "umeda", date: "2026-04-03" });
    expect(result?.members).toHaveLength(2);
  });
});
