import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/(app)/page";

// ── モック ────────────────────────────────────────────
const mockPush = vi.fn();
const mockLogin = vi.fn();
const mockUseLiff = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/components/LiffProvider", () => ({
  useLiff: () => mockUseLiff(),
}));

// ── 共通データ ────────────────────────────────────────
const loggedOutLiff = { isReady: true, user: null, login: mockLogin };

const loggedInWithNickname = {
  isReady: true,
  user: { id: "u1", nickname: "太郎", isLoggedIn: true, area: "umeda", industry: "it" },
  login: mockLogin,
};

const loggedInNoNickname = {
  isReady: true,
  user: { id: "u1", nickname: "", isLoggedIn: true, area: "", industry: "" },
  login: mockLogin,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home（ログインページ）", () => {
  // ─── 初期表示・リダイレクト ───────────────────────
  describe("初期表示", () => {
    it("ログイン済み・nickname あり → /matching にリダイレクト", async () => {
      mockUseLiff.mockReturnValue(loggedInWithNickname);
      render(<Home />);
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/matching"));
    });

    it("ログイン済み・nickname なし → リダイレクトしない", async () => {
      mockUseLiff.mockReturnValue(loggedInNoNickname);
      render(<Home />);
      await waitFor(() => expect(screen.getByText("LINEではじめる")).toBeInTheDocument());
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("未ログイン → ログインフォームが表示される", () => {
      mockUseLiff.mockReturnValue(loggedOutLiff);
      render(<Home />);
      expect(screen.getByPlaceholderText("招待コードを入力")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "LINEではじめる" })).toBeInTheDocument();
    });

    it("フィーチャーカードが3つ表示される", () => {
      mockUseLiff.mockReturnValue(loggedOutLiff);
      render(<Home />);
      expect(screen.getByText("3人1組だから安心")).toBeInTheDocument();
      expect(screen.getByText("ランチ限定")).toBeInTheDocument();
      expect(screen.getByText("審査制で安全")).toBeInTheDocument();
    });
  });

  // ─── 招待コード入力バリデーション ────────────────
  describe("招待コードバリデーション", () => {
    beforeEach(() => {
      mockUseLiff.mockReturnValue(loggedOutLiff);
    });

    it("招待コードが空で押すと「招待コードを入力してください」エラー", async () => {
      const ue = userEvent.setup();
      render(<Home />);
      await ue.click(screen.getByRole("button", { name: "LINEではじめる" }));
      await waitFor(() => {
        expect(screen.getByText("招待コードを入力してください")).toBeInTheDocument();
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("無効な招待コード（valid: false）→「無効な招待コードです」エラー", async () => {
      const ue = userEvent.setup();
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ valid: false }),
      } as Response);

      render(<Home />);
      await ue.type(screen.getByPlaceholderText("招待コードを入力"), "INVALID-CODE");
      await ue.click(screen.getByRole("button", { name: "LINEではじめる" }));

      await waitFor(() => {
        expect(screen.getByText("無効な招待コードです")).toBeInTheDocument();
      });
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it("有効な招待コード → sessionStorage に保存・login() 呼び出し", async () => {
      const ue = userEvent.setup();
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);

      render(<Home />);
      await ue.type(screen.getByPlaceholderText("招待コードを入力"), "VALID-CODE");
      await ue.click(screen.getByRole("button", { name: "LINEではじめる" }));

      await waitFor(() => {
        expect(sessionStorage.getItem("triangle_invite_code")).toBe("VALID-CODE");
        expect(mockLogin).toHaveBeenCalled();
      });
    });

    it("有効な招待コード → /profile に遷移", async () => {
      const ue = userEvent.setup();
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ valid: true }),
      } as Response);

      render(<Home />);
      await ue.type(screen.getByPlaceholderText("招待コードを入力"), "VALID-CODE");
      await ue.click(screen.getByRole("button", { name: "LINEではじめる" }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/profile");
      });
    });

    it("API 到達不能（例外）→ バリデーションをスキップして login() 呼び出し", async () => {
      const ue = userEvent.setup();
      vi.mocked(fetch).mockRejectedValue(new Error("network error"));

      render(<Home />);
      await ue.type(screen.getByPlaceholderText("招待コードを入力"), "ANY-CODE");
      await ue.click(screen.getByRole("button", { name: "LINEではじめる" }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });
    });

    it("API が 5xx → バリデーションをスキップして login() 呼び出し", async () => {
      const ue = userEvent.setup();
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "server error" }),
      } as Response);

      render(<Home />);
      await ue.type(screen.getByPlaceholderText("招待コードを入力"), "ANY-CODE");
      await ue.click(screen.getByRole("button", { name: "LINEではじめる" }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalled();
      });
    });

    it("入力中にエラーが表示されていた場合、入力すると消える", async () => {
      const ue = userEvent.setup();
      render(<Home />);

      // まずエラーを出す
      await ue.click(screen.getByRole("button", { name: "LINEではじめる" }));
      await waitFor(() => expect(screen.getByText("招待コードを入力してください")).toBeInTheDocument());

      // 入力するとエラーが消える
      await ue.type(screen.getByPlaceholderText("招待コードを入力"), "X");
      expect(screen.queryByText("招待コードを入力してください")).not.toBeInTheDocument();
    });
  });
});
