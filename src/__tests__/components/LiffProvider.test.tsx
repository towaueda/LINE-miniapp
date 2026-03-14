import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import LiffProvider, { useLiff } from "@/components/LiffProvider";

// ── liff モジュールをモック ────────────────────────────
const mockInitLiff = vi.fn();
const mockGetLiffProfile = vi.fn();
const mockLiffLogin = vi.fn();
const mockGetLiff = vi.fn();

vi.mock("@/lib/liff", () => ({
  initLiff: (...args: unknown[]) => mockInitLiff(...args),
  getLiffProfile: (...args: unknown[]) => mockGetLiffProfile(...args),
  liffLogin: (...args: unknown[]) => mockLiffLogin(...args),
  getLiff: (...args: unknown[]) => mockGetLiff(...args),
}));

// emoji モジュールをモック
vi.mock("@/lib/emoji", () => ({
  getRandomEmoji: () => "🎉",
}));

// ── liff インスタンスのモック ─────────────────────────
function makeLiffInstance(overrides: {
  isInClient?: boolean;
  isLoggedIn?: boolean;
  accessToken?: string | null;
  logout?: () => void;
} = {}) {
  return {
    isInClient: vi.fn().mockReturnValue(overrides.isInClient ?? false),
    isLoggedIn: vi.fn().mockReturnValue(overrides.isLoggedIn ?? true),
    getAccessToken: vi.fn().mockReturnValue(overrides.accessToken ?? "token-abc"),
    logout: overrides.logout ?? vi.fn(),
  };
}

// ── テスト用コンポーネント ────────────────────────────
function TestConsumer() {
  const { isReady, isLiffMode, user, dbUser, login, logout } = useLiff();
  return (
    <div>
      <span data-testid="isReady">{String(isReady)}</span>
      <span data-testid="isLiffMode">{String(isLiffMode)}</span>
      <span data-testid="userId">{user?.id ?? "null"}</span>
      <span data-testid="dbUserId">{dbUser?.id ?? "null"}</span>
      <button onClick={login}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

// ── localStorage / sessionStorage のリセット ──────────
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  // fetch はテストごとに設定
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("LiffProvider", () => {
  // ─── 非 LIFF 環境（ブラウザ直接アクセス） ───────────
  describe("非 LIFF 環境", () => {
    beforeEach(() => {
      mockInitLiff.mockResolvedValue(false);
    });

    it("isReady が true になる", async () => {
      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("isReady").textContent).toBe("true");
      });
    });

    it("isLiffMode が false のまま", async () => {
      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      expect(screen.getByTestId("isLiffMode").textContent).toBe("false");
    });

    it("localStorage にユーザーが保存されている → user が復元される", async () => {
      const storedUser = {
        id: "user-stored",
        nickname: "保存ユーザー",
        birthYear: 1990,
        area: "tokyo",
        industry: "IT",
        company: "test",
        bio: "",
        avatarEmoji: "😀",
        isLoggedIn: true,
      };
      localStorage.setItem("triangle_user", JSON.stringify(storedUser));

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      expect(screen.getByTestId("userId").textContent).toBe("user-stored");
    });

    it("localStorage が破損している → user は null のまま", async () => {
      localStorage.setItem("triangle_user", "INVALID_JSON{{{");

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      expect(screen.getByTestId("userId").textContent).toBe("null");
    });
  });

  // ─── LIFF 環境（isInClient=true） ────────────────────
  describe("LIFF 環境", () => {
    it("プロフィール取得 → user がセットされる", async () => {
      const liff = makeLiffInstance({ isInClient: true });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({
        userId: "line-user-1",
        displayName: "テストユーザー",
      });
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ user: { id: "db-1" } }) } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      expect(screen.getByTestId("userId").textContent).toBe("line-user-1");
      expect(screen.getByTestId("isLiffMode").textContent).toBe("true");
    });

    it("localStorage に既存ユーザーがある → nickname 等を引き継ぐ", async () => {
      const existingUser = {
        id: "line-user-1",
        nickname: "既存ニックネーム",
        birthYear: 1995,
        area: "osaka",
        industry: "finance",
        company: "ABC",
        bio: "よろしく",
        avatarEmoji: "🐱",
        isLoggedIn: true,
      };
      localStorage.setItem("triangle_user", JSON.stringify(existingUser));

      const liff = makeLiffInstance({ isInClient: true });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({
        userId: "line-user-1",
        displayName: "LIFFの名前",
      });
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ user: { id: "db-1" } }) } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      // nickname は既存のものを引き継ぐ（LIFF の displayName ではなく）
      expect(localStorage.getItem("triangle_user")).toContain("既存ニックネーム");
    });

    it("バックエンドログイン成功 → dbUser がセットされる", async () => {
      const liff = makeLiffInstance({ isInClient: true, accessToken: "access-token-xyz" });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({ userId: "line-user-2", displayName: "花子" });
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: "db-user-2", nickname: "花子" } }),
      } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("dbUserId").textContent).toBe("db-user-2"));
    });

    it("バックエンドログイン 4xx → リトライせず break", async () => {
      const liff = makeLiffInstance({ isInClient: true });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({ userId: "line-user-3", displayName: "太郎" });
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403, json: async () => ({}) } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      // 4xx はリトライしないので fetch は1回のみ
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("バックエンドログイン 5xx → 最大3回リトライ", async () => {
      vi.useFakeTimers();
      const liff = makeLiffInstance({ isInClient: true });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({ userId: "line-user-4", displayName: "次郎" });
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      // タイマーを進めてリトライを完了させる（waitFor はフェイクタイマー中に使えないため直接検証）
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(screen.getByTestId("isReady").textContent).toBe("true");
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("sessionStorage に invite code がある → fetch body に含まれる", async () => {
      sessionStorage.setItem("triangle_invite_code", "TRI-TEST-CODE");

      const liff = makeLiffInstance({ isInClient: true });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({ userId: "line-user-5", displayName: "三郎" });
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ user: { id: "db-5" } }) } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.inviteCode).toBe("TRI-TEST-CODE");

      // sessionStorage から削除される
      expect(sessionStorage.getItem("triangle_invite_code")).toBeNull();
    });

    it("getLiffProfile が null → user はセットされない", async () => {
      const liff = makeLiffInstance({ isInClient: true });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue(null);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      expect(screen.getByTestId("userId").textContent).toBe("null");
    });

    it("isInClient=false かつ isLoggedIn=false → プロフィール取得しない", async () => {
      const liff = makeLiffInstance({ isInClient: false, isLoggedIn: false });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      expect(mockGetLiffProfile).not.toHaveBeenCalled();
    });
  });

  // ─── logout ───────────────────────────────────────────
  describe("logout", () => {
    it("logout → user と dbUser がクリアされる", async () => {
      mockInitLiff.mockResolvedValue(false);

      // localStorage にユーザーをセット
      const storedUser = {
        id: "u1", nickname: "テスト", birthYear: 2000,
        area: "tokyo", industry: "IT", company: "", bio: "", avatarEmoji: "🐶", isLoggedIn: true,
      };
      localStorage.setItem("triangle_user", JSON.stringify(storedUser));

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));
      expect(screen.getByTestId("userId").textContent).toBe("u1");

      act(() => {
        screen.getByRole("button", { name: "logout" }).click();
      });

      expect(screen.getByTestId("userId").textContent).toBe("null");
      expect(screen.getByTestId("dbUserId").textContent).toBe("null");
      expect(localStorage.getItem("triangle_user")).toBeNull();
    });

    it("logout → triangle_match / triangle_chat / triangle_review_done も削除される", async () => {
      mockInitLiff.mockResolvedValue(false);
      localStorage.setItem("triangle_match", "data");
      localStorage.setItem("triangle_chat", "data");
      localStorage.setItem("triangle_review_done", "data");

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));

      act(() => {
        screen.getByRole("button", { name: "logout" }).click();
      });

      expect(localStorage.getItem("triangle_match")).toBeNull();
      expect(localStorage.getItem("triangle_chat")).toBeNull();
      expect(localStorage.getItem("triangle_review_done")).toBeNull();
    });

    it("LIFF モードで isLoggedIn=true → liff.logout() が呼ばれる", async () => {
      const mockLiffLogout = vi.fn();
      const liff = makeLiffInstance({ isLoggedIn: true, isInClient: true, logout: mockLiffLogout });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({ userId: "u2", displayName: "ユーザー" });
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ user: { id: "db-2" } }) } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));

      act(() => {
        screen.getByRole("button", { name: "logout" }).click();
      });

      expect(mockLiffLogout).toHaveBeenCalled();
    });
  });

  // ─── login ────────────────────────────────────────────
  describe("login", () => {
    it("isLiffMode=true → liffLogin() が呼ばれる", async () => {
      const liff = makeLiffInstance({ isInClient: true });
      mockInitLiff.mockResolvedValue(true);
      mockGetLiff.mockReturnValue(liff);
      mockGetLiffProfile.mockResolvedValue({ userId: "u3", displayName: "ユーザー3" });
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ user: { id: "db-3" } }) } as Response);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isLiffMode").textContent).toBe("true"));

      act(() => {
        screen.getByRole("button", { name: "login" }).click();
      });

      expect(mockLiffLogin).toHaveBeenCalled();
    });

    it("isLiffMode=false → liffLogin() は呼ばれない", async () => {
      mockInitLiff.mockResolvedValue(false);

      render(
        <LiffProvider>
          <TestConsumer />
        </LiffProvider>
      );

      await waitFor(() => expect(screen.getByTestId("isReady").textContent).toBe("true"));

      act(() => {
        screen.getByRole("button", { name: "login" }).click();
      });

      expect(mockLiffLogin).not.toHaveBeenCalled();
    });
  });

  // ─── children レンダリング ────────────────────────────
  it("children を正常にレンダリングする", async () => {
    mockInitLiff.mockResolvedValue(false);

    render(
      <LiffProvider>
        <div data-testid="child">子コンポーネント</div>
      </LiffProvider>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
