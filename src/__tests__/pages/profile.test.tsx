import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProfilePage from "@/app/(app)/profile/page";

// ── モック ────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockSetUser = vi.fn();
const mockSetDbUser = vi.fn();
const mockUseLiff = vi.fn();
vi.mock("@/components/LiffProvider", () => ({
  useLiff: () => mockUseLiff(),
}));

import { apiFetch } from "@/lib/api";

// ── テスト共通データ ──────────────────────────────────
const emptyUser = {
  id: "user-1",
  nickname: "",
  area: "",
  industry: "",
  company: "",
  bio: "",
  avatarEmoji: "😀",
  birthYear: 2000,
  isLoggedIn: true,
};

const completedUser = {
  ...emptyUser,
  nickname: "テスト太郎",
  area: "umeda",
  industry: "it",
  bio: "よろしくお願いします",
  company: "テスト株式会社",
};

const defaultLiff = {
  user: completedUser,
  dbUser: { id: "db-1" },
  isReady: true,
  isLiffMode: false,
  setUser: mockSetUser,
  setDbUser: mockSetDbUser,
};

describe("ProfilePage - 実際のユーザー操作", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLiff.mockReturnValue(defaultLiff);
  });

  // ─── 初期表示 ─────────────────────────────────────
  describe("初期表示", () => {
    it("プロフィールページが表示される", () => {
      render(<ProfilePage />);
      expect(screen.getByText("プロフィール登録")).toBeInTheDocument();
    });

    it("保存済みのニックネームが入力欄に反映される", () => {
      render(<ProfilePage />);
      const input = screen.getByPlaceholderText("例：たくみ") as HTMLInputElement;
      expect(input.value).toBe("テスト太郎");
    });

    it("保存済みのエリア（梅田）が選択状態で表示される", () => {
      render(<ProfilePage />);
      expect(screen.getByRole("button", { name: "梅田" }).className).toContain("bg-orange");
    });

    it("保存済みの業種（IT）が選択状態で表示される", () => {
      render(<ProfilePage />);
      expect(screen.getByRole("button", { name: "IT" }).className).toContain("bg-orange");
    });

    it("保存済みの自己紹介がテキストエリアに反映される", () => {
      render(<ProfilePage />);
      const textarea = screen.getByPlaceholderText("趣味や好きなものを書いてみましょう") as HTMLTextAreaElement;
      expect(textarea.value).toBe("よろしくお願いします");
    });

    it("user=null → ページが表示されない（null 返却）", () => {
      mockUseLiff.mockReturnValue({ ...defaultLiff, user: null });
      const { container } = render(<ProfilePage />);
      expect(container.firstChild).toBeNull();
    });
  });

  // ─── ニックネーム入力 ─────────────────────────────
  describe("ニックネーム入力", () => {
    it("入力した文字がフィールドに表示される", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({ ...defaultLiff, user: emptyUser });
      render(<ProfilePage />);

      const input = screen.getByPlaceholderText("例：たくみ");
      await ue.type(input, "新しい名前");

      expect((input as HTMLInputElement).value).toBe("新しい名前");
    });

    it("既存の値をクリアして新しい値を入力できる", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      const input = screen.getByPlaceholderText("例：たくみ");
      await ue.clear(input);
      await ue.type(input, "変更後の名前");

      expect((input as HTMLInputElement).value).toBe("変更後の名前");
    });
  });

  // ─── エリア選択 ──────────────────────────────────
  describe("エリア選択", () => {
    it("エリアチップをクリックすると選択される", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({ ...defaultLiff, user: emptyUser });
      render(<ProfilePage />);

      await ue.click(screen.getByRole("button", { name: "難波" }));
      expect(screen.getByRole("button", { name: "難波" }).className).toContain("bg-orange");
    });

    it("別のエリアを選択すると前の選択が解除される", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      // 現在「梅田」が選択済み
      await ue.click(screen.getByRole("button", { name: "本町" }));

      expect(screen.getByRole("button", { name: "本町" }).className).toContain("bg-orange");
      expect(screen.getByRole("button", { name: "梅田" }).className).not.toContain("bg-orange");
    });

    it("全エリアオプションが表示される", () => {
      render(<ProfilePage />);
      expect(screen.getByRole("button", { name: "梅田" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "淀屋橋" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "本町" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "難波" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "天王寺" })).toBeInTheDocument();
    });
  });

  // ─── 業種選択 ────────────────────────────────────
  describe("業種選択", () => {
    it("業種チップをクリックすると選択される", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({ ...defaultLiff, user: emptyUser });
      render(<ProfilePage />);

      await ue.click(screen.getByRole("button", { name: "金融" }));
      expect(screen.getByRole("button", { name: "金融" }).className).toContain("bg-orange");
    });

    it("別の業種を選択すると前の選択が解除される", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      // 現在「IT」が選択済み
      await ue.click(screen.getByRole("button", { name: "コンサル" }));

      expect(screen.getByRole("button", { name: "コンサル" }).className).toContain("bg-orange");
      expect(screen.getByRole("button", { name: "IT" }).className).not.toContain("bg-orange");
    });
  });

  // ─── 自己紹介 ────────────────────────────────────
  describe("自己紹介フィールド", () => {
    it("テキスト入力 → 文字数カウントが更新される", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      const textarea = screen.getByPlaceholderText("趣味や好きなものを書いてみましょう");
      await ue.clear(textarea);
      await ue.type(textarea, "abc");

      await waitFor(() => {
        expect(screen.getByText(/3\/100/)).toBeInTheDocument();
      });
    });

    it("初期値の文字数が正しく表示される", () => {
      render(<ProfilePage />);
      // "よろしくお願いします" = 10文字
      expect(screen.getByText("10/100")).toBeInTheDocument();
    });
  });

  // ─── 保存ボタンの活性状態 ────────────────────────
  describe("保存ボタンの活性状態", () => {
    it("全必須項目あり → 保存ボタンが有効", () => {
      render(<ProfilePage />);
      expect(screen.getByRole("button", { name: "保存してマッチングへ" })).not.toBeDisabled();
    });

    it("ニックネームなし → 保存ボタンが disabled", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      await ue.clear(screen.getByPlaceholderText("例：たくみ"));

      expect(screen.getByRole("button", { name: "保存してマッチングへ" })).toBeDisabled();
    });

    it("エリア未選択 → 保存ボタンが disabled", async () => {
      mockUseLiff.mockReturnValue({
        ...defaultLiff,
        user: { ...emptyUser, nickname: "名前あり", industry: "it" },
      });
      render(<ProfilePage />);

      expect(screen.getByRole("button", { name: "保存してマッチングへ" })).toBeDisabled();
    });

    it("業種未選択 → 保存ボタンが disabled", () => {
      mockUseLiff.mockReturnValue({
        ...defaultLiff,
        user: { ...completedUser, industry: "" },
      });
      render(<ProfilePage />);
      expect(screen.getByRole("button", { name: "保存してマッチングへ" })).toBeDisabled();
    });
  });

  // ─── 保存処理 ─────────────────────────────────────
  describe("保存ボタン押下", () => {
    it("クリック → setUser が呼ばれる", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      await ue.click(screen.getByRole("button", { name: "保存してマッチングへ" }));

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith(
          expect.objectContaining({ nickname: "テスト太郎" })
        );
      });
    });

    it("クリック後 → /matching に遷移", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      await ue.click(screen.getByRole("button", { name: "保存してマッチングへ" }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/matching");
      });
    });

    it("保存中 → ボタンが「保存中...」に変わる", async () => {
      const ue = userEvent.setup();
      vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });

      render(<ProfilePage />);
      await ue.click(screen.getByRole("button", { name: "保存してマッチングへ" }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "保存中..." })).toBeInTheDocument();
      });
    });

    it("isLiffMode=true & dbUser あり → apiFetch PUT が呼ばれる", async () => {
      const ue = userEvent.setup();
      mockUseLiff.mockReturnValue({ ...defaultLiff, isLiffMode: true });
      vi.mocked(apiFetch).mockResolvedValue({ user: { id: "db-1", nickname: "テスト太郎" } });

      render(<ProfilePage />);
      await ue.click(screen.getByRole("button", { name: "保存してマッチングへ" }));

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          "/api/users/profile",
          expect.objectContaining({ method: "PUT" })
        );
      });
    });

    it("isLiffMode=false → apiFetch が呼ばれない", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      await ue.click(screen.getByRole("button", { name: "保存してマッチングへ" }));

      await waitFor(() => expect(mockPush).toHaveBeenCalled());
      expect(apiFetch).not.toHaveBeenCalled();
    });

    it("ニックネームの前後スペースが trim される", async () => {
      const ue = userEvent.setup();
      render(<ProfilePage />);

      const input = screen.getByPlaceholderText("例：たくみ");
      await ue.clear(input);
      await ue.type(input, "  スペースあり  ");

      await ue.click(screen.getByRole("button", { name: "保存してマッチングへ" }));

      await waitFor(() => {
        expect(mockSetUser).toHaveBeenCalledWith(
          expect.objectContaining({ nickname: "スペースあり" })
        );
      });
    });
  });
});
