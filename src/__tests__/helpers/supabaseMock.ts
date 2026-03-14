import { vi } from "vitest";

export interface MockResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

/**
 * Supabase のクエリビルダーチェーンを再現するモックオブジェクトを生成する。
 * `.select().eq().single()` のような連鎖呼び出しをサポートし、
 * 最終的に result を resolve する。
 */
export function createQueryBuilder(result: MockResult = { data: null, error: null }) {
  const self: Record<string, unknown> = {};

  const chainMethods = [
    "select", "eq", "neq", "in", "not", "is", "order", "limit",
    "range", "lt", "gte", "lte", "or", "ilike", "filter", "head",
    "update", "insert", "upsert", "delete",
  ];

  chainMethods.forEach((method) => {
    self[method] = vi.fn().mockReturnValue(self);
  });

  self.single = vi.fn().mockResolvedValue(result);
  self.then = vi.fn().mockImplementation((resolve: (v: MockResult) => unknown) =>
    Promise.resolve(result).then(resolve)
  );

  return self;
}

/**
 * テーブル名ごとに異なる MockResult を返す supabaseAdmin.from モックを設定する。
 * 同一テーブルへの複数回呼び出しにも対応するため、配列で指定できる。
 */
export function setupFromMock(
  mockFrom: ReturnType<typeof vi.fn>,
  tableResults: Record<string, MockResult | MockResult[]>
) {
  const counters: Record<string, number> = {};

  mockFrom.mockImplementation((table: string) => {
    const entry = tableResults[table];
    if (!entry) return createQueryBuilder({ data: null, error: null });

    if (Array.isArray(entry)) {
      const idx = counters[table] ?? 0;
      counters[table] = idx + 1;
      return createQueryBuilder(entry[idx] ?? entry[entry.length - 1]);
    }

    return createQueryBuilder(entry);
  });
}

/** テスト用の DbUser ファクトリ */
export function makeDbUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-uuid-1",
    line_user_id: "Uline1234",
    nickname: "テスト太郎",
    birth_year: 1998,
    area: "umeda",
    industry: "it",
    company: "株式会社テスト",
    bio: "よろしく",
    avatar_emoji: "😊",
    is_banned: false,
    ban_reason: null,
    is_approved: true,
    invited_by_code: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** テスト用の MatchGroup ファクトリ */
export function makeMatchGroup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "group-uuid-1",
    area: "umeda",
    date: "2026-03-20",
    time: "12:00",
    restaurant_id: null,
    restaurant_name: "未定",
    status: "confirmed",
    created_at: "2026-03-13T00:00:00Z",
    updated_at: "2026-03-13T00:00:00Z",
    ...overrides,
  };
}

/** POST リクエストを生成するヘルパー */
export function createPostRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** GET リクエストを生成するヘルパー */
export function createGetRequest(
  url = "http://localhost/api/test",
  headers: Record<string, string> = {}
): Request {
  return new Request(url, { method: "GET", headers });
}
